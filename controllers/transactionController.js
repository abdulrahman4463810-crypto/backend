const Transaction = require("../models/Transaction");
const {
  applyTransactionPayload,
  recalcStock,
} = require("../services/stockService");
const audit = require("../services/auditService");
const {
  workbookFromBuffer,
  selectWorksheet,
  mapExcelRows,
  toNumber,
  cleanText,
} = require("../utils/excelImport");

function txType(param) {
  return param === "inward" ? "inward" : "issuance";
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  const txt = cleanText(value);

  const found = categories.find(
    (category) => category.toLowerCase() === txt.toLowerCase()
  );

  return found || "Inventory";
}

function parseDate(value) {
  if (!value) return undefined;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  const txt = cleanText(value);
  if (!txt) return undefined;

  const d = new Date(txt);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function pick(row, keys) {
  for (const key of keys) {
    const value = row?.[key];

    if (value !== undefined && value !== null && cleanText(value) !== "") {
      return value;
    }
  }

  return "";
}

function stripLookupWarning(payload) {
  if (payload && payload._lookupWarning) {
    delete payload._lookupWarning;
  }

  return payload;
}

function rowToTransaction(row, type) {
  const isInward = type === "inward";

  const payload = {
    srNo: toNumber(pick(row, ["srNo", "Sr", "SR #", "S No", "S.No"])),
    itemCode: cleanText(
      pick(row, ["itemCode", "Item Code", "ITEM CODE", "Code", "Item No"])
    ),
    itemDescription: cleanText(
      pick(row, [
        "itemDescription",
        "Item Description",
        "ITEM DESCRIPTION",
        "Description",
        "Item Name",
      ])
    ),
    category: categoryValue(pick(row, ["category", "Category"])),
    uom: cleanText(pick(row, ["uom", "UOM", "Unit", "Units"])),
    department: cleanText(pick(row, ["department", "Department"])),
    unitPrice: toNumber(pick(row, ["unitPrice", "Unit Price", "Rate", "Price"])),
    total: toNumber(pick(row, ["total", "Total", "Amount"])),
  };

  if (isInward) {
    payload.deliveryDate =
      parseDate(pick(row, ["deliveryDate", "Delivery Date", "Date", "date"])) ||
      new Date();

    payload.qtyReceived = toNumber(
      pick(row, ["qtyReceived", "Qty Received", "Qty", "Quantity", "inwardQty"])
    );

    payload.openQty = toNumber(pick(row, ["openQty", "Open Qty", "Balance Qty"]));

    payload.vendorSupplier = cleanText(
      pick(row, [
        "vendorSupplier",
        "Vendor/Supplier",
        "Vendor",
        "Supplier",
        "Supplier / Vendor",
      ])
    );

    payload.receivedBy = cleanText(pick(row, ["receivedBy", "Received By"]));

    payload.grnStatusWithDate = cleanText(
      pick(row, ["grnStatusWithDate", "GRN Status with Date", "Status"])
    );
  } else {
    payload.date =
      parseDate(pick(row, ["date", "Date", "ISSUE DATE", "issueDate"])) ||
      new Date();

    payload.qtyIssued = toNumber(
      pick(row, ["qtyIssued", "Qty Issued", "Qty", "Quantity", "issuedQty"])
    );

    payload.balanceQty = toNumber(
      pick(row, ["balanceQty", "Balance Qty", "Balance"])
    );

    payload.equipmentName = cleanText(
      pick(row, ["equipmentName", "Equipment Name"])
    );

    payload.subEquipmentName = cleanText(
      pick(row, ["subEquipmentName", "Sub Equipment Name"])
    );

    payload.issuedTo = cleanText(pick(row, ["issuedTo", "Issued To"]));
    payload.shift = cleanText(pick(row, ["shift", "Shift"]));
  }

  return payload;
}

function fallbackPayload(row, type) {
  const isInward = type === "inward";

  const payload = {
    ...row,
    type,
    itemCode: cleanText(row.itemCode),
    itemDescription: cleanText(row.itemDescription),
    category: categoryValue(row.category),
    uom: cleanText(row.uom),
    department: cleanText(row.department),
    unitPrice: Number(row.unitPrice || 0),
    total: Number(row.total || 0),
  };

  if (isInward) {
    payload.deliveryDate = row.deliveryDate || new Date();
    payload.qtyReceived = Number(row.qtyReceived || 0);
    payload.openQty = Number(row.openQty || 0);
    payload.vendorSupplier = cleanText(row.vendorSupplier);
    payload.receivedBy = cleanText(row.receivedBy);
    payload.grnStatusWithDate = cleanText(row.grnStatusWithDate);

    if (!payload.total) {
      payload.total = payload.qtyReceived * payload.unitPrice;
    }
  } else {
    payload.date = row.date || new Date();
    payload.qtyIssued = Number(row.qtyIssued || 0);
    payload.balanceQty = Number(row.balanceQty || 0);
    payload.equipmentName = cleanText(row.equipmentName);
    payload.subEquipmentName = cleanText(row.subEquipmentName);
    payload.issuedTo = cleanText(row.issuedTo);
    payload.shift = cleanText(row.shift);

    if (!payload.total) {
      payload.total = payload.qtyIssued * payload.unitPrice;
    }
  }

  return payload;
}

async function buildPayload(row, type) {
  try {
    const payload = await applyTransactionPayload(row, type);
    payload.type = type;
    return payload;
  } catch (err) {
    const payload = fallbackPayload(row, type);
    payload._lookupWarning = err.message;
    return payload;
  }
}

async function safeRecalcStock(itemCode, category) {
  try {
    if (itemCode && category) {
      await recalcStock(itemCode, category);
    }
  } catch (err) {
    console.warn(`Stock recalc skipped for ${itemCode}: ${err.message}`);
  }
}

exports.getTransactions = async (req, res, next) => {
  try {
    const type = txType(req.params.type);
    const q = cleanText(req.query.q);

    const filter = { type };

    if (q) {
      const safeQ = escapeRegex(q);

      filter.$or = [
        { itemCode: new RegExp(safeQ, "i") },
        { itemDescription: new RegExp(safeQ, "i") },
        { category: new RegExp(safeQ, "i") },
        { department: new RegExp(safeQ, "i") },
        { equipmentName: new RegExp(safeQ, "i") },
        { vendorSupplier: new RegExp(safeQ, "i") },
        { issuedTo: new RegExp(safeQ, "i") },
        { shift: new RegExp(safeQ, "i") },
      ];
    }

    const rows = await Transaction.find(filter).sort({ createdAt: -1 });
    res.json(rows);
  } catch (e) {
    next(e);
  }
};

exports.createTransaction = async (req, res, next) => {
  try {
    const type = txType(req.params.type);

    const payload = await buildPayload({ ...req.body }, type);
    stripLookupWarning(payload);

    const row = await Transaction.create(payload);

    await safeRecalcStock(row.itemCode, row.category);
    await audit(req, "CREATE", type.toUpperCase(), row.toObject());

    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
};

exports.updateTransaction = async (req, res, next) => {
  try {
    const old = await Transaction.findById(req.params.id);

    if (!old) {
      return res.status(404).json({
        message: "Transaction not found",
      });
    }

    const type = old.type;

    const payload = await buildPayload(
      {
        ...old.toObject(),
        ...req.body,
      },
      type
    );

    stripLookupWarning(payload);

    const row = await Transaction.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });

    await safeRecalcStock(old.itemCode, old.category);
    await safeRecalcStock(row.itemCode, row.category);

    await audit(req, "UPDATE", type.toUpperCase(), {
      id: req.params.id,
    });

    res.json(row);
  } catch (e) {
    next(e);
  }
};

exports.deleteTransaction = async (req, res, next) => {
  try {
    const row = await Transaction.findByIdAndDelete(req.params.id);

    if (!row) {
      return res.status(404).json({
        message: "Transaction not found",
      });
    }

    await safeRecalcStock(row.itemCode, row.category);
    await audit(req, "DELETE", row.type.toUpperCase(), row.toObject());

    res.json({
      message: "Deleted",
    });
  } catch (e) {
    next(e);
  }
};

exports.deleteAllTransactions = async (req, res, next) => {
  try {
    const type = txType(req.params.type);

    const affected = await Transaction.find({ type }).select(
      "itemCode category"
    );

    const result = await Transaction.deleteMany({ type });

    const uniqueItems = new Set(
      affected
        .filter((x) => x.itemCode && x.category)
        .map((x) => `${x.itemCode}||${x.category}`)
    );

    for (const key of uniqueItems) {
      const [itemCode, category] = key.split("||");
      await safeRecalcStock(itemCode, category);
    }

    await audit(req, "DELETE_ALL", type.toUpperCase(), {
      deleted: result.deletedCount,
    });

    res.json({
      message: "All transaction rows deleted",
      deleted: result.deletedCount,
    });
  } catch (e) {
    next(e);
  }
};

exports.importTransactions = async (req, res, next) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({
        message: "Excel file is required",
      });
    }

    const type = txType(req.params.type);

    const wb = await workbookFromBuffer(req.file.buffer);

    const preferred =
      req.body.sheetName ||
      (type === "inward" ? "Daily Inward" : "Daily Issuance");

    const ws = selectWorksheet(wb, preferred);

    if (!ws) {
      return res.status(400).json({
        message: "Excel sheet not found",
      });
    }

    const rawRows = mapExcelRows(
      ws,
      type === "inward" ? inwardColumns : issueColumns
    );

    const rows = rawRows
      .map((row) => rowToTransaction(row, type))
      .filter((row) => cleanText(row.itemCode));

    if (!rows.length) {
      return res.status(400).json({
        message: "No valid transaction rows found. Item Code is required.",
      });
    }

    let imported = 0;
    let lookupWarnings = 0;
    const failed = [];

    for (const row of rows) {
      try {
        const payload = await buildPayload(row, type);

        if (payload._lookupWarning) {
          lookupWarnings += 1;
          delete payload._lookupWarning;
        }

        const saved = await Transaction.create(payload);

        await safeRecalcStock(saved.itemCode, saved.category);

        imported += 1;
      } catch (err) {
        failed.push({
          itemCode: row.itemCode,
          category: row.category,
          message: err.message,
        });
      }
    }

    await audit(req, "IMPORT", type.toUpperCase(), {
      totalRows: rows.length,
      imported,
      failed: failed.length,
      lookupWarnings,
    });

    if (!imported) {
      return res.status(400).json({
        message: `No rows imported. First error: ${
          failed[0]?.message || "Invalid data"
        }`,
        totalRows: rows.length,
        imported,
        failed: failed.length,
        lookupWarnings,
        failedRows: failed.slice(0, 50),
      });
    }

    res.status(201).json({
      message: `${
        type === "inward" ? "Inward" : "Issuance"
      } import completed. Total valid ${rows.length}, imported ${imported}${
        failed.length ? `, failed ${failed.length}` : ""
      }${lookupWarnings ? `, lookup warnings ${lookupWarnings}` : ""}.`,
      totalRows: rows.length,
      imported,
      failed: failed.length,
      lookupWarnings,
      failedRows: failed.slice(0, 50),
    });
  } catch (e) {
    next(e);
  }
};
