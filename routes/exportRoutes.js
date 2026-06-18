const router = require("express").Router();
const c = require("../controllers/exportController");
const { protect } = require("../middleware/auth");

router.get("/excel", protect, c.exportExcel);
router.get("/pdf", protect, c.exportPDF);

module.exports = router;
