const StockItem = require("../models/StockItem");
const Transaction = require("../models/Transaction");

function number(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function recalcStock(itemCode, category) {
  const item = await StockItem.findOne({ itemCode: String(itemCode), category });
  if (!item) return null;

  const inwardAgg = await Transaction.aggregate([
    { $match: { itemCode: String(itemCode), category, type: "inward" } },
    { $group: { _id: null, qty: { $sum: "$qtyReceived" } } },
  ]);

  const issueAgg = await Transaction.aggregate([
    { $match: { itemCode: String(itemCode), category, type: "issuance" } },
    { $group: { _id: null, qty: { $sum: "$qtyIssued" } } },
  ]);

  item.inwardQty = number(inwardAgg[0]?.qty);
  item.issuedQty = number(issueAgg[0]?.qty);
  item.balanceQty = number(item.openingQty) + item.inwardQty - item.issuedQty;
  item.totalValue = item.balanceQty * number(item.unitPrice);
  await item.save();
  return item;
}

async function lookupItem(itemCode, category) {
  return StockItem.findOne({ itemCode: String(itemCode), category });
}

async function applyTransactionPayload(payload, type, existingTransaction = null) {
  const item = await lookupItem(payload.itemCode, payload.category);
  if (!item) {
    const err = new Error("Item Code not found in selected category");
    err.status = 404;
    throw err;
  }

  const currentStock = await recalcStock(item.itemCode, item.category) || item;
  const oldQty = existingTransaction
    ? (type === "issuance" ? number(existingTransaction.qtyIssued) : number(existingTransaction.qtyReceived))
    : 0;

  if (type === "issuance") {
    const newQty = number(payload.qtyIssued);
    const availableForEdit = number(currentStock.balanceQty) + oldQty;
    if (newQty > availableForEdit) {
      const err = new Error(`Stock insufficient. Available balance is ${availableForEdit}`);
      err.status = 400;
      throw err;
    }
    payload.balanceQty = availableForEdit - newQty;
    payload.total = newQty * number(item.unitPrice);
  } else {
    const qty = number(payload.qtyReceived);
    payload.openQty = number(currentStock.balanceQty);
    payload.total = qty * number(item.unitPrice);
  }

  payload.itemCode = item.itemCode;
  payload.itemDescription = item.itemDescription;
  payload.uom = item.uom;
  payload.unitPrice = item.unitPrice;
  payload.category = item.category;
  return payload;
}

module.exports = { recalcStock, lookupItem, applyTransactionPayload, number };
