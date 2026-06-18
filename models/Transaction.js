const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["inward", "issuance"], required: true },
    srNo: Number,
    date: Date,
    deliveryDate: Date,
    itemCode: { type: String, required: true },
    itemDescription: String,
    category: { type: String, enum: ["Inventory", "Non Inventory", "Services", "Patty Cash"], required: true },
    uom: String,
    qtyReceived: { type: Number, default: 0 },
    openQty: { type: Number, default: 0 },
    qtyIssued: { type: Number, default: 0 },
    balanceQty: { type: Number, default: 0 },
    equipmentName: String,
    subEquipmentName: String,
    issuedTo: String,
    shift: String,
    department: String,
    unitPrice: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    vendorSupplier: String,
    receivedBy: String,
    status: String,
    grnStatusWithDate: String,
    grnDate: Date,
  },
  { timestamps: true }
);

transactionSchema.index({ itemCode: 1, category: 1, type: 1 });

module.exports = mongoose.model("Transaction", transactionSchema);
