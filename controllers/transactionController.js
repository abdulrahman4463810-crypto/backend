const Transaction = require("../models/Transaction");
const { applyTransactionPayload, recalcStock } = require("../services/stockService");
const audit = require("../services/auditService");
const { workbookFromBuffer, selectWorksheet, mapExcelRows, toNumber, cleanText } = require("../utils/excelImport");

function txType(param) {
  return param === "inward" ? "inward" : "issuance";
}

const categories = ["Inventory", "Non Inventory", "Services", "Patty Cash"];

const inwardColumns = [
  { key: "srNo", label: "Sr" },
  { key: "deliveryDate", label: "Delivery Date" },
  { key: "itemCode", label: "Item Code" },
  { key: "itemDescription", label: "Item Description" },
  { key: "category", label: "Category" },
  { key: "uom", label: "UOM" },
  { key: "qtyReceived", label: "Qty Received" },
  { key: "openQty", label: "Open Qty" },
  { key: "unitPrice", label: "Unit Price" },
  { key: "total", label: "Total" },
  { key: "vendorSupplier", label: "Vendor/Supplier" },
  { key: "department", label: "Department" },
  { key: "receivedBy", label: "Received By" },
  { key: "grnStatusWithDate", label: "GRN Status with Date" },
];

const issueColumns = [
  { key: "srNo", label: "Sr" },
  { key: "date", label: "Date" },
  { key: "itemCode", label: "Item Code" },
  { key: "itemDescription", label: "Item Description" },
  { key: "category", label: "Category" },
  { key: "uom", label: "UOM" },
  { key: "qtyIssued", label: "Qty Issued" },
  { key: "balanceQty", label: "Balance Qty" },
  { key: "equipmentName", label: "Equipment Name" },
  { key: "subEquipmentName", label: "Sub Equipment Name" },
  { key: "issuedTo", label: "Issued To" },
  { key: "shift", label: "Shift" },
  { key: "department", label: "Department" },
  { key: "unitPrice", label: "Unit Price" },
  { key: "total", label: "Total" },
];

function categoryValue(value) {
  const found = categories.find(c => c.toLowerCase() === cleanText(value).toLowerCase());
  return found || "Inventory";
}

function parseDate(value) {
  const txt = cleanText(value);
  if (!txt) return undefined;
  const d = new Date(txt);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function rowToTransaction(row, type) {
  const isInward = type === "inward";
  const payload = {
    srNo: toNumber(row.srNo || row["Sr"] || row["SR #"]),
    itemCode: cleanText(row.itemCode || row["Item Code"] || row.Code),
    itemDescription: cleanText(row.itemDescription || row["Item Description"] || row.Description),
    category: categoryValue(row.category || row.Category),
    uom: cleanText(row.uom || row.UOM),
    department: cleanText(row.department || row.Department),
    unitPrice: toNumber(row.unitPrice || row["Unit Price"] || row.Rate),
    total: toNumber(row.total || row.Total),
  };
  if (isInward) {
    payload.deliveryDate = parseDate(row.deliveryDate || row["Delivery Date"] || row.Date);
    payload.qtyReceived = toNumber(row.qtyReceived || row["Qty Received"] || row.Qty || row.Quantity);
    payload.openQty = toNumber(row.openQty || row["Open Qty"]);
    payload.vendorSupplier = cleanText(row.vendorSupplier || row["Vendor/Supplier"] || row.Vendor || row.Supplier);
    payload.receivedBy = cleanText(row.receivedBy || row["Received By"]);
    payload.grnStatusWithDate = cleanText(row.grnStatusWithDate || row["GRN Status with Date"] || row.Status);
  } else {
    payload.date = parseDate(row.date || row.Date);
    payload.qtyIssued = toNumber(row.qtyIssued || row["Qty Issued"] || row.Qty || row.Quantity);
    payload.balanceQty = toNumber(row.balanceQty || row["Balance Qty"]);
    payload.equipmentName = cleanText(row.equipmentName || row["Equipment Name"]);
    payload.subEquipmentName = cleanText(row.subEquipmentName || row["Sub Equipment Name"]);
    payload.issuedTo = cleanText(row.issuedTo || row["Issued To"]);
    payload.shift = cleanText(row.shift || row.Shift);
  }
  return payload;
}

exports.getTransactions = async (req, res, next) => {
  try {
    const type = txType(req.params.type);
    const q = req.query.q || "";
    const filter = { type };
    if (q) {
      filter.$or = [
        { itemCode: new RegExp(q, "i") },
        { itemDescription: new RegExp(q, "i") },
        { category: new RegExp(q, "i") },
        { department: new RegExp(q, "i") },
        { equipmentName: new RegExp(q, "i") },
        { vendorSupplier: new RegExp(q, "i") },
      ];
    }
    const rows = await Transaction.find(filter).sort({ createdAt: -1 });
    res.json(rows);
  } catch (e) { next(e); }
};

exports.createTransaction = async (req, res, next) => {
  try {
    const type = txType(req.params.type);
    const payload = await applyTransactionPayload({ ...req.body }, type);
    payload.type = type;
    const row = await Transaction.create(payload);
    await recalcStock(row.itemCode, row.category);
    await audit(req, "CREATE", type.toUpperCase(), row.toObject());
    res.status(201).json(row);
  } catch (e) { next(e); }
};

exports.updateTransaction = async (req, res, next) => {
  try {
    const old = await Transaction.findById(req.params.id);
    if (!old) return res.status(404).json({ message: "Transaction not found" });
    const type = old.type;
    const payload = await applyTransactionPayload({ ...old.toObject(), ...req.body }, type, old);
    const row = await Transaction.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
    await recalcStock(old.itemCode, old.category);
    await recalcStock(row.itemCode, row.category);
    await audit(req, "UPDATE", type.toUpperCase(), { id: req.params.id });
    res.json(row);
  } catch (e) { next(e); }
};

exports.deleteTransaction = async (req, res, next) => {
  try {
    const row = await Transaction.findByIdAndDelete(req.params.id);
    if (!row) return res.status(404).json({ message: "Transaction not found" });
    await recalcStock(row.itemCode, row.category);
    await audit(req, "DELETE", row.type.toUpperCase(), row.toObject());
    res.json({ message: "Deleted" });
  } catch (e) { next(e); }
};

exports.deleteAllTransactions = async (req, res, next) => {
  try {
    const type = txType(req.params.type);
    const affected = await Transaction.find({ type }).select("itemCode category");
    const result = await Transaction.deleteMany({ type });
    const uniqueItems = new Set(affected.map(x => `${x.itemCode}||${x.category}`));
    for (const key of uniqueItems) {
      const [itemCode, category] = key.split("||");
      await recalcStock(itemCode, category);
    }
    await audit(req, "DELETE_ALL", type.toUpperCase(), { deleted: result.deletedCount });
    res.json({ message: "All transaction rows deleted", deleted: result.deletedCount });
  } catch (e) { next(e); }
};

exports.importTransactions = async (req, res, next) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ message: "Excel file is required" });
    const type = txType(req.params.type);
    const wb = await workbookFromBuffer(req.file.buffer);
    const preferred = req.body.sheetName || (type === "inward" ? "Daily Inward" : "Daily Issuance");
    const ws = selectWorksheet(wb, preferred);
    if (!ws) return res.status(400).json({ message: "Excel sheet not found" });
    const rows = mapExcelRows(ws, type === "inward" ? inwardColumns : issueColumns).map(row => rowToTransaction(row, type)).filter(row => row.itemCode);
    if (!rows.length) return res.status(400).json({ message: "No valid transaction rows found. Item Code is required." });
    let imported = 0;
    const failed = [];
    for (const row of rows) {
      try {
        const payload = await applyTransactionPayload(row, type);
        payload.type = type;
        await Transaction.create(payload);
        await recalcStock(payload.itemCode, payload.category);
        imported += 1;
      } catch (err) {
        failed.push({ itemCode: row.itemCode, message: err.message });
      }
    }
    await audit(req, "IMPORT", type.toUpperCase(), { imported, failed: failed.length });
    if (!imported) return res.status(400).json({ message: `No rows imported. First error: ${failed[0]?.message || "Invalid data"}`, failed });
    res.status(201).json({ message: "Transactions imported successfully", imported, failed: failed.length, failedRows: failed.slice(0, 20) });
  } catch (e) { next(e); }
};
