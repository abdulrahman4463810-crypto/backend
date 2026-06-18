const mongoose = require("mongoose");

const stockItemSchema = new mongoose.Schema(
  {
    itemCode: { type: String, required: true },
    itemDescription: { type: String, required: true },
    category: { type: String, enum: ["Inventory", "Non Inventory", "Services", "Patty Cash"], required: true },
    uom: { type: String, default: "" },
    openingQty: { type: Number, default: 0 },
    inwardQty: { type: Number, default: 0 },
    issuedQty: { type: Number, default: 0 },
    balanceQty: { type: Number, default: 0 },
    unitPrice: { type: Number, default: 0 },
    totalValue: { type: Number, default: 0 },
    location: { type: String, default: "" },
  },
  { timestamps: true }
);

stockItemSchema.index({ itemCode: 1, category: 1 }, { unique: true });

module.exports = mongoose.model("StockItem", stockItemSchema);
