const router = require("express").Router();
const multer = require("multer");

const stockController = require("../controllers/stockController");
const { protect, allowRoles } = require("../middleware/auth");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "application/vnd.ms-excel.sheet.macroEnabled.12",
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only Excel files are allowed"));
    }
  },
});

/*
  IMPORTANT:
  Static routes must stay above dynamic routes like /:category and /:id
*/

// Summary route
router.get("/summary", protect, stockController.summary);

// Lookup route
// Example: /api/stock/lookup?itemCode=4777&category=Services
router.get("/lookup", protect, stockController.lookup);

// Get stock by category
// Example: /api/stock/inventory
router.get("/:category", protect, stockController.getStock);

// Create stock item
router.post(
  "/:category",
  protect,
  allowRoles("superadmin", "admin"),
  stockController.createStock
);

// Import stock from Excel
router.post(
  "/:category/import",
  protect,
  allowRoles("superadmin", "admin"),
  upload.single("file"),
  stockController.importStock
);

// Delete all stock rows by category
router.delete(
  "/:category/all",
  protect,
  allowRoles("superadmin"),
  stockController.deleteAllStock
);

// Update stock item by ID
router.put(
  "/:id",
  protect,
  allowRoles("superadmin", "admin"),
  stockController.updateStock
);

// Delete single stock item by ID
router.delete(
  "/:id",
  protect,
  allowRoles("superadmin"),
  stockController.deleteStock
);

module.exports = router;
