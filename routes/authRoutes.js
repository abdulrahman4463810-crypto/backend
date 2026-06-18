const router = require("express").Router();
const c = require("../controllers/authController");
const { protect } = require("../middleware/auth");

router.post("/register", c.register);
router.post("/login", c.login);
router.post("/forgot", c.forgotPassword);
router.get("/profile", protect, c.profile);
router.put("/profile", protect, c.updateProfile);
router.put("/change-password", protect, c.changePassword);

module.exports = router;
