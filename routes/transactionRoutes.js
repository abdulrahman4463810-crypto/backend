const router = require("express").Router();
const multer = require("multer");
const c = require("../controllers/transactionController");
const { protect, allowRoles } = require("../middleware/auth");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.get("/:type", protect, c.getTransactions);
router.post("/:type", protect, allowRoles("superadmin", "admin"), c.createTransaction);
router.post("/:type/import", protect, allowRoles("superadmin", "admin"), upload.single("file"), c.importTransactions);
router.delete("/:type/all", protect, allowRoles("superadmin"), c.deleteAllTransactions);
router.put("/:id", protect, allowRoles("superadmin", "admin"), c.updateTransaction);
router.delete("/:id", protect, allowRoles("superadmin"), c.deleteTransaction);

module.exports = router;
