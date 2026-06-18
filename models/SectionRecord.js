const mongoose = require("mongoose");

const sectionRecordSchema = new mongoose.Schema(
  {
    sectionKey: { type: String, required: true, index: true },
    pageKey: { type: String, required: true, index: true },
    title: { type: String, default: "" },
    rowIndex: { type: Number, default: 0 },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, strict: false }
);

sectionRecordSchema.index({ sectionKey: 1, pageKey: 1, rowIndex: 1 });

module.exports = mongoose.model("SectionRecord", sectionRecordSchema);
