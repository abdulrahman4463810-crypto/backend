const router = require("express").Router();
const multer = require("multer");
const c = require("../controllers/listController");
const { protect, allowRoles } = require("../middleware/auth");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.get("/", protect, c.getLists);
router.post("/", protect, allowRoles("superadmin"), c.createList);
router.post("/import", protect, allowRoles("superadmin"), upload.single("file"), c.importLists);
router.delete("/all", protect, allowRoles("superadmin"), c.deleteAllLists);
router.put("/:id", protect, allowRoles("superadmin"), c.updateList);
router.delete("/:id", protect, allowRoles("superadmin"), c.deleteList);

module.exports = router;
