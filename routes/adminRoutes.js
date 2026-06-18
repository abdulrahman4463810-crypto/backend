const router = require("express").Router();
const c = require("../controllers/adminController");
const { protect, allowRoles } = require("../middleware/auth");

router.use(protect, allowRoles("superadmin"));

router.get("/users", c.getUsers);
router.post("/users", c.createUser);
router.put("/users/:id", c.updateUser);
router.delete("/users/:id", c.deleteUser);

// Backward compatible endpoints used by older screens.
router.post("/change-role", c.changeRole);
router.post("/delete", c.deleteUser);

module.exports = router;
