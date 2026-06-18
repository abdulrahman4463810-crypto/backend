const router = require("express").Router();
const multer = require("multer");
const c = require("../controllers/importController");
const { protect, allowRoles } = require("../middleware/auth");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/\.(xlsx|xls|xlsm)$/i.test(file.originalname)) return cb(null, true);
    cb(new Error("Only Excel files are allowed"));
  },
});

router.post("/excel", protect, allowRoles("superadmin", "admin"), upload.single("file"), c.importExcelWorkbook);

module.exports = router;
