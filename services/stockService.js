const StockItem = require("../models/StockItem");
const Transaction = require("../models/Transaction");

function number(value) {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function cleanText(value) {
  return String(value || "").trim();
}

function escapeRegex(value) {
  return cleanText(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function regexExact(value) {
  return new RegExp(`^${escapeRegex(value)}$`, "i");
}

/*
  Lookup rule:
  1. Pehle exact itemCode + category
  2. Phir case-insensitive itemCode + category
  3. Phir sirf itemCode
*/
async function lookupItem(itemCode, category) {
  const code = cleanText(itemCode);
  const cat = cleanText(category);

  if (!code) return null;

  if (cat) {
    const exactItem = await StockItem.findOne({
      itemCode: code,
      category: cat,
    });

    if (exactItem) return exactItem;

    const flexibleItem = await StockItem.findOne({
      itemCode: regexExact(code),
      category: regexExact(cat),
    });

    if (flexibleItem) return flexibleItem;
  }

  return StockItem.findOne({
    itemCode: regexExact(code),
  });
}

async function recalcStock(itemCode, category) {
  const item = await lookupItem(itemCode, category);
  if (!item) return null;

  const code = cleanText(item.itemCode);
  const cat = cleanText(item.category);

  const inwardAgg = await Transaction.aggregate([
    {
      $match: {
        itemCode: code,
        category: cat,
        type: "inward",
      },
    },
    {
      $group: {
        _id: null,
        qty: { $sum: "$qtyReceived" },
      },
    },
  ]);

  const issueAgg = await Transaction.aggregate([
    {
      $match: {
        itemCode: code,
        category: cat,
        type: "issuance",
      },
    },
    {
      $group: {
        _id: null,
        qty: { $sum: "$qtyIssued" },
      },
    },
  ]);

  item.inwardQty = number(inwardAgg[0]?.qty);
  item.issuedQty = number(issueAgg[0]?.qty);
  item.balanceQty = number(item.openingQty) + item.inwardQty - item.issuedQty;
  item.totalValue = item.balanceQty * number(item.unitPrice);

  await item.save();

  return item;
}

async function applyTransactionPayload(payload, type, existingTransaction = null) {
  const item = await lookupItem(payload.itemCode, payload.category);

  if (!item) {
    const err = new Error("Item Code not found in selected category");
    err.status = 404;
    throw err;
  }

  const currentStock = (await recalcStock(item.itemCode, item.category)) || item;

  const oldQty = existingTransaction
    ? type === "issuance"
      ? number(existingTransaction.qtyIssued)
      : number(existingTransaction.qtyReceived)
    : 0;

  if (type === "issuance") {
    const newQty = number(payload.qtyIssued);
    const availableForEdit = number(currentStock.balanceQty) + oldQty;

    if (newQty > availableForEdit) {
      const err = new Error(
        `Stock insufficient. Available balance is ${availableForEdit}`
      );
      err.status = 400;
      throw err;
    }

    const itemPrice = number(item.unitPrice);

    payload.balanceQty = availableForEdit - newQty;
    payload.unitPrice = itemPrice;
    payload.total = newQty * itemPrice;
  } else {
    const qty = number(payload.qtyReceived);

    /*
      IMPORTANT:
      Inward me sheet wali Unit Price aur Total preserve karo.
      Stock item ki old price se overwrite nahi karna.
    */
    const sheetUnitPrice = number(payload.unitPrice);
    const sheetTotal = number(payload.total);

    let finalUnitPrice = sheetUnitPrice;

    if (!finalUnitPrice && qty > 0 && sheetTotal > 0) {
      finalUnitPrice = sheetTotal / qty;
    }

    if (!finalUnitPrice) {
      finalUnitPrice = number(item.unitPrice);
    }

    payload.openQty = number(currentStock.balanceQty);
    payload.unitPrice = finalUnitPrice;
    payload.total = sheetTotal > 0 ? sheetTotal : qty * finalUnitPrice;
  }

  payload.itemCode = cleanText(item.itemCode);
  payload.itemDescription = cleanText(item.itemDescription);
  payload.uom = cleanText(item.uom);
  payload.category = cleanText(item.category);

  return payload;
}

module.exports = {
  recalcStock,
  lookupItem,
  applyTransactionPayload,
  number,
};
