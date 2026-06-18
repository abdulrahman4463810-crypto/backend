const mongoose = require("mongoose");

const itemSchema = new mongoose.Schema({
  itemCode: String,
  description: String,
  uom: String,
  unitPrice: Number,
  category: String
});

module.exports = mongoose.model("Item", itemSchema);