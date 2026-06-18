const router = require("express").Router();
const multer = require("multer");
const c = require("../controllers/stockController");
const { protect, allowRoles } = require("../middleware/auth");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.get("/summary", protect, c.summary);
router.get("/lookup", protect, c.lookup);
router.get("/:category", protect, c.getStock);
router.post("/:category", protect, allowRoles("superadmin", "admin"), c.createStock);
router.post("/:category/import", protect, allowRoles("superadmin", "admin"), upload.single("file"), c.importStock);
router.delete("/:category/all", protect, allowRoles("superadmin"), c.deleteAllStock);
router.put("/:id", protect, allowRoles("superadmin", "admin"), c.updateStock);
router.delete("/:id", protect, allowRoles("superadmin"), c.deleteStock);

module.exports = router;
