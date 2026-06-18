const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  itemCode: String,
  opening: Number,
  inward: Number,
  issued: Number,
  balance: Number
});

module.exports = mongoose.model("Inventory", schema);