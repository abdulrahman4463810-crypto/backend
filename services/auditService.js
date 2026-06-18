const AuditLog = require("../models/AuditLog");

async function audit(req, action, module, details = {}) {
  try {
    await AuditLog.create({
      user: req.user?.email || "system",
      role: req.user?.role || "system",
      action,
      module,
      details,
    });
  } catch (e) {
    console.error("Audit failed:", e.message);
  }
}

module.exports = audit;
