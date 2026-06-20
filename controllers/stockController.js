const StockItem = require("../models/StockItem");
const { recalcStock, lookupItem } = require("../services/stockService");
const audit = require("../services/auditService");
const {
  workbookFromBuffer,
  selectWorksheet,
  mapExcelRows,
  toNumber,
  cleanText,
} = require("../utils/excelImport");

const categoryMap = {
  inventory: "Inventory",

  noninventory: "Non Inventory",
  "non-inventory": "Non Inventory",
  "non_inventory": "Non Inventory",

  services: "Services",
  service: "Services",

  pattycash: "Patty Cash",
  "patty-cash": "Patty Cash",
  "patty_cash": "Patty Cash",

  pettycash: "Patty Cash",
  "petty-cash": "Patty Cash",
  "petty_cash": "Patty Cash",
};

function normalizeCategory(param) {
  const key = String(param || "").trim().toLowerCase();
  return categoryMap[key] || param;
}

function firstValue(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return "";
}

const stockColumns = [
  { key: "srNo", label: "Sr No" },
  { key: "itemCode", label: "Item Code" },
  { key: "itemDescription", label: "Item Description" },
  { key: "uom", label: "UOM" },
  { key: "openingQty", label: "Opening Qty" },
  { key: "inwardQty", label: "Inward Qty" },
  { key: "issuedQty", label: "Issued Qty" },
  { key: "balanceQty", label: "Balance Qty" },
  { key: "unitPrice", label: "Unit Price" },
  { key: "totalValue", label: "Total Value" },
  { key: "location", label: "Location" },
];

function stockPayload(row, category) {
  const openingQty = toNumber(
    firstValue(row, ["openingQty", "Opening Qty", "Opening", "Open Qty"])
  );

  const inwardQty = toNumber(
    firstValue(row, ["inwardQty", "Inward Qty", "Inward", "Qty Received"])
  );

  const issuedQty = toNumber(
    firstValue(row, ["issuedQty", "Issued Qty", "Issued", "Qty Issued"])
  );

  let balanceQty = toNumber(
    firstValue(row, ["balanceQty", "Balance Qty", "Balance"])
  );

  const unitPrice = toNumber(
    firstValue(row, ["unitPrice", "Unit Price", "Price", "Rate"])
  );

  let totalValue = toNumber(
    firstValue(row, ["totalValue", "Total Value", "Total", "Amount"])
  );

  if (!balanceQty) {
    balanceQty = openingQty + inwardQty - issuedQty;
  }

  if (!totalValue) {
    totalValue = balanceQty * unitPrice;
  }

  return {
    category,
    srNo: toNumber(
      firstValue(row, ["srNo", "Sr No", "Sr", "SR #", "S No", "S.No"])
    ),

    itemCode: cleanText(
      firstValue(row, [
        "itemCode",
        "Item Code",
        "ITEM CODE",
        "Code",
        "Item No",
        "Item #",

        "Services Code",
        "Service Code",

        "Patty Cash Code",
        "Petty Cash Code",
      ])
    ),

    itemDescription: cleanText(
      firstValue(row, [
        "itemDescription",
        "Item Description",
        "ITEM DESCRIPTION",
        "Description",
        "Item Name",
        "ITEM NAME",

        "Services Description",
        "Service Description",

        "Patty Cash Item Description",
        "Petty Cash Item Description",
      ])
    ),

    uom: cleanText(
      firstValue(row, ["uom", "UOM", "Unit", "Units"])
    ),

    openingQty,
    inwardQty,
    issuedQty,
    balanceQty,
    unitPrice,
    totalValue,

    location: cleanText(
      firstValue(row, ["location", "Location", "Rack", "Rack No"])
    ),
  };
}

exports.getStock = async (req, res, next) => {
  try {
    const category = normalizeCategory(req.params.category || req.query.category);
    const q = req.query.q || "";

    const filter = { category };

    if (q) {
      filter.$or = [
        { itemCode: new RegExp(q, "i") },
        { itemDescription: new RegExp(q, "i") },
        { uom: new RegExp(q, "i") },
        { location: new RegExp(q, "i") },
      ];
    }

    const rows = await StockItem.find(filter).sort({ itemCode: 1 });
    res.json(rows);
  } catch (e) {
    next(e);
  }
};

exports.lookup = async (req, res, next) => {
  try {
    const category = normalizeCategory(req.query.category);
    const item = await lookupItem(req.query.itemCode, category);

    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    const fresh = (await recalcStock(item.itemCode, item.category)) || item;
    res.json(fresh);
  } catch (e) {
    next(e);
  }
};

exports.createStock = async (req, res, next) => {
  try {
    const payload = {
      ...req.body,
      category: normalizeCategory(req.body.category || req.params.category),
    };

    payload.openingQty = Number(payload.openingQty || 0);
    payload.inwardQty = Number(payload.inwardQty || 0);
    payload.issuedQty = Number(payload.issuedQty || 0);
    payload.unitPrice = Number(payload.unitPrice || 0);

    payload.balanceQty =
      payload.openingQty + payload.inwardQty - payload.issuedQty;

    payload.totalValue = payload.balanceQty * payload.unitPrice;

    const item = await StockItem.create(payload);

    await audit(req, "CREATE", "STOCK", item.toObject());

    res.status(201).json(item);
  } catch (e) {
    next(e);
  }
};

exports.updateStock = async (req, res, next) => {
  try {
    const item = await StockItem.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!item) {
      return res.status(404).json({ message: "Stock item not found" });
    }

    await recalcStock(item.itemCode, item.category);
    await audit(req, "UPDATE", "STOCK", { id: req.params.id });

    const updated = await StockItem.findById(req.params.id);
    res.json(updated);
  } catch (e) {
    next(e);
  }
};

exports.deleteStock = async (req, res, next) => {
  try {
    const item = await StockItem.findByIdAndDelete(req.params.id);

    if (!item) {
      return res.status(404).json({ message: "Stock item not found" });
    }

    await audit(req, "DELETE", "STOCK", item.toObject());

    res.json({ message: "Deleted" });
  } catch (e) {
    next(e);
  }
};

exports.deleteAllStock = async (req, res, next) => {
  try {
    const category = normalizeCategory(req.params.category);
    const result = await StockItem.deleteMany({ category });

    await audit(req, "DELETE_ALL", "STOCK", {
      category,
      deleted: result.deletedCount,
    });

    res.json({
      message: "All stock rows deleted",
      deleted: result.deletedCount,
    });
  } catch (e) {
    next(e);
  }
};

exports.importStock = async (req, res, next) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ message: "Excel file is required" });
    }

    const category = normalizeCategory(req.params.category);

    const wb = await workbookFromBuffer(req.file.buffer);

    const ws = selectWorksheet(wb, req.body.sheetName || category);

    if (!ws) {
      return res.status(400).json({
        message: `Excel sheet not found for ${category}`,
      });
    }

    const rows = mapExcelRows(ws, stockColumns)
      .map((row) => stockPayload(row, category))
      .filter((row) => row.itemCode && row.itemDescription);

    if (!rows.length) {
      return res.status(400).json({
        message:
          "No valid stock rows found. Item Code and Item Description are required.",
      });
    }

    let imported = 0;

    for (const row of rows) {
      await StockItem.updateOne(
        {
          itemCode: row.itemCode,
          category,
        },
        {
          $set: row,
        },
        {
          upsert: true,
          runValidators: true,
        }
      );

      imported += 1;
    }

    await audit(req, "IMPORT", "STOCK", {
      category,
      imported,
    });

    res.status(201).json({
      message: "Stock imported successfully",
      imported,
    });
  } catch (e) {
    next(e);
  }
};

exports.summary = async (req, res, next) => {
  try {
    const rows = await StockItem.aggregate([
      {
        $group: {
          _id: "$category",
          items: { $sum: 1 },
          value: { $sum: "$totalValue" },
          balance: { $sum: "$balanceQty" },
        },
      },
    ]);

    res.json(rows);
  } catch (e) {
    next(e);
  }
};
