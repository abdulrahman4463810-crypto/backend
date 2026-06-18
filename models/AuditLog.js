const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    user: String,
    role: String,
    action: String,
    module: String,
    details: Object,
  },
  { timestamps: true }
);

module.exports = mongoose.model("AuditLog", auditLogSchema);
