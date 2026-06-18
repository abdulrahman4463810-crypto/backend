const mongoose = require("mongoose");

const listItemSchema = new mongoose.Schema(
  {
    group: { type: String, required: true },
    value: { type: String, required: true },
  },
  { timestamps: true }
);

listItemSchema.index({ group: 1, value: 1 }, { unique: true });

module.exports = mongoose.model("ListItem", listItemSchema);
