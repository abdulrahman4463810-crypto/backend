const StockItem = require("../models/StockItem");
const { recalcStock } = require("../services/stockService");
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
  "non inventory": "Non Inventory",

  services: "Services",
  service: "Services",

  pattycash: "Patty Cash",
  "patty-cash": "Patty Cash",
  "patty_cash": "Patty Cash",
  "patty cash": "Patty Cash",

  pettycash: "Patty Cash",
  "petty-cash": "Patty Cash",
  "petty_cash": "Patty Cash",
  "petty cash": "Patty Cash",
};

function normalizeCategory(param) {
  const key = String(param || "").trim().toLowerCase();
  return categoryMap[key] || String(param || "").trim();
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

    uom: cleanText(firstValue(row, ["uom", "UOM", "Unit", "Units"])),

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
    const q = cleanText(req.query.q);

    const filter = { category };

    if (q) {
      const safeQ = escapeRegex(q);

      filter.$or = [
        { itemCode: new RegExp(safeQ, "i") },
        { itemDescription: new RegExp(safeQ, "i") },
        { uom: new RegExp(safeQ, "i") },
        { location: new RegExp(safeQ, "i") },
      ];
    }

    const rows = await StockItem.find(filter).sort({
      itemCode: 1,
      itemDescription: 1,
    });

    res.json(rows);
  } catch (e) {
    next(e);
  }
};

exports.lookup = async (req, res, next) => {
  try {
    const itemCode = cleanText(req.query.itemCode);
    const category = normalizeCategory(req.query.category);

    if (!itemCode || !category) {
      return res.status(400).json({
        message: "Item Code and Category are required",
      });
    }

    const item = await StockItem.findOne({
      category,
      itemCode: new RegExp(`^${escapeRegex(itemCode)}$`, "i"),
    });

    if (!item) {
      return res.status(404).json({
        message: `Item not found in ${category}`,
      });
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

    payload.itemCode = cleanText(payload.itemCode);
    payload.itemDescription = cleanText(payload.itemDescription);
    payload.uom = cleanText(payload.uom);
    payload.location = cleanText(payload.location);

    if (!payload.itemCode || !payload.itemDescription) {
      return res.status(400).json({
        message: "Item Code and Item Description are required",
      });
    }

    payload.openingQty = Number(payload.openingQty || 0);
    payload.inwardQty = Number(payload.inwardQty || 0);
    payload.issuedQty = Number(payload.issuedQty || 0);
    payload.unitPrice = Number(payload.unitPrice || 0);

    payload.balanceQty =
      payload.openingQty + payload.inwardQty - payload.issuedQty;

    payload.totalValue = payload.balanceQty * payload.unitPrice;

    const item = await StockItem.findOneAndUpdate(
      {
        itemCode: payload.itemCode,
        category: payload.category,
      },
      {
        $set: payload,
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    await audit(req, "UPSERT", "STOCK", item.toObject());

    res.status(201).json(item);
  } catch (e) {
    next(e);
  }
};

exports.updateStock = async (req, res, next) => {
  try {
    const payload = { ...req.body };

    if (payload.category !== undefined) {
      payload.category = normalizeCategory(payload.category);
    }

    if (payload.itemCode !== undefined) {
      payload.itemCode = cleanText(payload.itemCode);
    }

    if (payload.itemDescription !== undefined) {
      payload.itemDescription = cleanText(payload.itemDescription);
    }

    if (payload.uom !== undefined) {
      payload.uom = cleanText(payload.uom);
    }

    if (payload.location !== undefined) {
      payload.location = cleanText(payload.location);
    }

    const oldItem = await StockItem.findById(req.params.id);

    if (!oldItem) {
      return res.status(404).json({
        message: "Stock item not found",
      });
    }

    const openingQty =
      payload.openingQty !== undefined
        ? Number(payload.openingQty || 0)
        : Number(oldItem.openingQty || 0);

    const inwardQty =
      payload.inwardQty !== undefined
        ? Number(payload.inwardQty || 0)
        : Number(oldItem.inwardQty || 0);

    const issuedQty =
      payload.issuedQty !== undefined
        ? Number(payload.issuedQty || 0)
        : Number(oldItem.issuedQty || 0);

    const unitPrice =
      payload.unitPrice !== undefined
        ? Number(payload.unitPrice || 0)
        : Number(oldItem.unitPrice || 0);

    payload.openingQty = openingQty;
    payload.inwardQty = inwardQty;
    payload.issuedQty = issuedQty;
    payload.unitPrice = unitPrice;
    payload.balanceQty = openingQty + inwardQty - issuedQty;
    payload.totalValue = payload.balanceQty * unitPrice;

    const item = await StockItem.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });

    await recalcStock(item.itemCode, item.category);

    await audit(req, "UPDATE", "STOCK", {
      id: req.params.id,
      itemCode: item.itemCode,
      category: item.category,
    });

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
      return res.status(404).json({
        message: "Stock item not found",
      });
    }

    await audit(req, "DELETE", "STOCK", item.toObject());

    res.json({
      message: "Deleted",
    });
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
      return res.status(400).json({
        message: "Excel file is required",
      });
    }

    const category = normalizeCategory(
      req.body.category || req.params.category
    );

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
          "No valid stock rows found. Please check Excel headers: Item Code and Item Description.",
      });
    }

    let imported = 0;

    for (const row of rows) {
      await StockItem.findOneAndUpdate(
        {
          itemCode: row.itemCode,
          category,
        },
        {
          $set: row,
        },
        {
          upsert: true,
          new: true,
          runValidators: true,
          setDefaultsOnInsert: true,
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
    console.error("Stock import failed:", e);
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
      {
        $sort: {
          _id: 1,
        },
      },
    ]);

    res.json(rows);
  } catch (e) {
    next(e);
  }
};
