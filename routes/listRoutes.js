const router = require("express").Router();
const multer = require("multer");

const c = require("../controllers/listController");
const { protect, allowRoles } = require("../middleware/auth");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
});

/*
  GET /api/lists
  MachineDashboard isi API se Equipment/Machine names track karega.
*/
router.get("/", protect, c.getLists);

/*
  CREATE list item
*/
router.post(
  "/",
  protect,
  allowRoles("superadmin", "admin"),
  c.createList
);

/*
  IMPORT Excel list
*/
router.post(
  "/import",
  protect,
  allowRoles("superadmin", "admin"),
  upload.single("file"),
  c.importLists
);

/*
  DELETE ALL lists
  Sirf superadmin
*/
router.delete(
  "/all",
  protect,
  allowRoles("superadmin"),
  c.deleteAllLists
);

/*
  UPDATE list item
*/
router.put(
  "/:id",
  protect,
  allowRoles("superadmin", "admin"),
  c.updateList
);

/*
  DELETE single list item
  Sirf superadmin
*/
router.delete(
  "/:id",
  protect,
  allowRoles("superadmin"),
  c.deleteList
);

module.exports = router;
