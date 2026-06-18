const router = require("express").Router();
const c = require("../controllers/dashboardController");
const { protect } = require("../middleware/auth");

router.get("/master", protect, c.master);
router.get("/machine", protect, c.machine);

module.exports = router;
