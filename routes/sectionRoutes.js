const router = require("express").Router();
const multer = require("multer");
const c = require("../controllers/sectionController");
const { protect, allowRoles } = require("../middleware/auth");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.get("/:sectionKey/:pageKey", protect, c.getRecords);
router.post("/:sectionKey/:pageKey", protect, allowRoles("superadmin", "admin"), c.createRecord);
router.post("/:sectionKey/:pageKey/import", protect, allowRoles("superadmin", "admin"), upload.single("file"), c.importRecords);
router.delete("/:sectionKey/:pageKey/all", protect, allowRoles("superadmin"), c.deleteAll);
router.put("/:id", protect, allowRoles("superadmin", "admin"), c.updateRecord);
router.delete("/:id", protect, allowRoles("superadmin"), c.deleteRecord);

module.exports = router;
