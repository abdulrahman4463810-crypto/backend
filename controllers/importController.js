const XLSX = require("xlsx");
const StockItem = require("../models/StockItem");
const Transaction = require("../models/Transaction");
const ListItem = require("../models/ListItem");
const { recalcStock } = require("../services/stockService");
const audit = require("../services/auditService");

const STOCK_SHEETS = {
  Inventory: "Inventory",
  "Non Inventory": "Non Inventory",
  Services: "Services",
  "Patty Cash": "Patty Cash",
};
const CATEGORIES = Object.values(STOCK_SHEETS);

function text(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}
function num(v) {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function excelDate(v) {
  if (!v) return undefined;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if (typeof v === "number") {
    const parsed = XLSX.SSF.parse_date_code(v);
    if (parsed) return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
function rowsOf(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true });
}
function findHeader(rows, expected) {
  return rows.findIndex(row => expected.every(word => row.some(cell => text(cell).toLowerCase().includes(word.toLowerCase()))));
}
function val(row, idx) { return idx < row.length ? row[idx] : ""; }

async function importStockSheet(wb, sheetName, category) {
  const rows = rowsOf(wb, sheetName);
  const header = findHeader(rows, ["item", "description", "uom"]);
  const body = rows.slice(header >= 0 ? header + 1 : 3);
  let count = 0;
  for (const row of body) {
    const itemCode = text(val(row, 1));
    const itemDescription = text(val(row, 2));
    if (!itemCode || !itemDescription) continue;
    const payload = {
      itemCode,
      itemDescription,
      category,
      uom: text(val(row, 3)),
      openingQty: num(val(row, 4)),
      inwardQty: num(val(row, 5)),
      issuedQty: num(val(row, 6)),
      balanceQty: num(val(row, 7)),
      unitPrice: num(val(row, 8)),
      totalValue: num(val(row, 9)),
      location: text(val(row, 10)),
    };
    payload.balanceQty = payload.balanceQty || (payload.openingQty + payload.inwardQty - payload.issuedQty);
    payload.totalValue = payload.totalValue || (payload.balanceQty * payload.unitPrice);
    await StockItem.updateOne({ itemCode, category }, { $set: payload }, { upsert: true, runValidators: true });
    count += 1;
  }
  return count;
}

async function importDailyInward(wb) {
  const rows = rowsOf(wb, "Daily Inward");
  const header = findHeader(rows, ["delivery", "item", "qty"]);
  const body = rows.slice(header >= 0 ? header + 1 : 3);
  let count = 0;
  for (const row of body) {
    const itemCode = text(val(row, 2));
    const category = text(val(row, 4));
    if (!itemCode || !CATEGORIES.includes(category)) continue;
    const payload = {
      type: "inward",
      srNo: num(val(row, 0)),
      deliveryDate: excelDate(val(row, 1)),
      itemCode,
      itemDescription: text(val(row, 3)),
      category,
      uom: text(val(row, 5)),
      qtyReceived: num(val(row, 6)),
      openQty: num(val(row, 7)),
      unitPrice: num(val(row, 8)),
      total: num(val(row, 9)),
      vendorSupplier: text(val(row, 10)),
      department: text(val(row, 11)),
      receivedBy: text(val(row, 12)),
      grnStatusWithDate: text(val(row, 13)),
    };
    payload.total = payload.total || payload.qtyReceived * payload.unitPrice;
    await Transaction.updateOne(
      { type: "inward", itemCode, category, deliveryDate: payload.deliveryDate, qtyReceived: payload.qtyReceived, total: payload.total },
      { $set: payload },
      { upsert: true, runValidators: true }
    );
    count += 1;
  }
  return count;
}

async function importDailyIssuance(wb) {
  const rows = rowsOf(wb, "Daily Issuance");
  const header = findHeader(rows, ["date", "item", "qty"]);
  const body = rows.slice(header >= 0 ? header + 1 : 3);
  let count = 0;
  for (const row of body) {
    const itemCode = text(val(row, 2));
    const category = text(val(row, 4));
    if (!itemCode || !CATEGORIES.includes(category)) continue;
    const payload = {
      type: "issuance",
      srNo: num(val(row, 0)),
      date: excelDate(val(row, 1)),
      itemCode,
      itemDescription: text(val(row, 3)),
      category,
      uom: text(val(row, 5)),
      qtyIssued: num(val(row, 6)),
      balanceQty: num(val(row, 7)),
      equipmentName: text(val(row, 8)),
      subEquipmentName: text(val(row, 9)),
      issuedTo: text(val(row, 10)),
      shift: text(val(row, 11)),
      department: text(val(row, 12)),
      unitPrice: num(val(row, 13)),
      total: num(val(row, 14)),
    };
    payload.total = payload.total || payload.qtyIssued * payload.unitPrice;
    await Transaction.updateOne(
      { type: "issuance", itemCode, category, date: payload.date, qtyIssued: payload.qtyIssued, equipmentName: payload.equipmentName, total: payload.total },
      { $set: payload },
      { upsert: true, runValidators: true }
    );
    count += 1;
  }
  return count;
}

async function importLists(wb) {
  const groups = new Map();
  for (const sheetName of ["Lists", "List"]) {
    const rows = rowsOf(wb, sheetName);
    if (!rows.length) continue;
    const headerIndex = findHeader(rows, ["equipment", "category"]);
    const header = rows[headerIndex >= 0 ? headerIndex : 0].map(text);
    rows.slice((headerIndex >= 0 ? headerIndex : 0) + 1).forEach(row => {
      header.forEach((group, i) => {
        const value = text(row[i]);
        if (!group || !value) return;
        const fixedGroup = group.replace("Units", "UOM").replace("Issued To", "Issued To");
        groups.set(`${fixedGroup}||${value}`, { group: fixedGroup, value });
      });
    });
  }
  let count = 0;
  for (const payload of groups.values()) {
    await ListItem.updateOne(payload, { $setOnInsert: payload }, { upsert: true });
    count += 1;
  }
  return count;
}

exports.importExcelWorkbook = async (req, res, next) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ message: "Excel file is required" });
    const wb = XLSX.read(req.file.buffer, { type: "buffer", cellDates: true });
    const summary = { stockItems: 0, dailyInward: 0, dailyIssuance: 0, lists: 0 };

    for (const [sheetName, category] of Object.entries(STOCK_SHEETS)) {
      if (wb.SheetNames.includes(sheetName)) summary.stockItems += await importStockSheet(wb, sheetName, category);
    }
    if (wb.SheetNames.includes("Daily Inward")) summary.dailyInward = await importDailyInward(wb);
    if (wb.SheetNames.includes("Daily Issuance")) summary.dailyIssuance = await importDailyIssuance(wb);
    summary.lists = await importLists(wb);

    const items = await StockItem.find().select("itemCode category");
    for (const item of items) await recalcStock(item.itemCode, item.category);

    await audit(req, "IMPORT", "EXCEL", summary);
    res.json({ message: "Excel workbook imported successfully", summary });
  } catch (e) { next(e); }
};
