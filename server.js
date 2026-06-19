require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const connectDB = require("./config/db");

const app = express();

const isProduction =
  process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);

// Allowed frontend URLs
function allowedOrigins() {
  const envOrigins = String(
    process.env.CLIENT_URL || process.env.FRONTEND_URL || ""
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  // Local + deployed frontend fallback
  const defaultOrigins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://kolsonstore.netlify.app",
  ];

  return [...new Set([...envOrigins, ...defaultOrigins])];
}

// Vercel / proxy support
app.set("trust proxy", 1);

// Security headers
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

// CORS setup
const corsOptions = {
  origin(origin, callback) {
    const origins = allowedOrigins();

    // Postman, server-to-server, same-origin requests
    if (!origin) {
      return callback(null, true);
    }

    if (origins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked this origin: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));

// Express 5 me app.options("*") kabhi error deta hai,
// isliye regex use kiya hai.
app.options(/.*/, cors(corsOptions));

// Body parser
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// Dev logging
if (!isProduction) {
  app.use(morgan("dev"));
}

// Rate limit
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      message: "Too many requests. Please try again later.",
    },
  })
);

// Root route
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "LOTTE KOLSON STORE MANAGEMENT SYSTEM API RUNNING",
    status: "ok",
    platform: process.env.VERCEL ? "vercel" : "node",
    frontend: allowedOrigins(),
  });
});

// Health route
app.get("/api/health", async (req, res) => {
  try {
    const connection = await connectDB();

    return res.status(200).json({
      success: true,
      status: "ok",
      database: connection ? "connected" : "not_connected",
      ownerSeed: connection ? "enabled" : "waiting_for_mongo_uri",
      platform: process.env.VERCEL ? "vercel" : "node",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      status: "error",
      database: "not_connected",
      message: error.message || "MongoDB health check failed",
    });
  }
});

// MongoDB connection middleware for all /api routes
app.use("/api", async (req, res, next) => {
  try {
    const connection = await connectDB();

    if (!connection) {
      return res.status(500).json({
        success: false,
        message:
          "MongoDB not connected. Add a valid MONGO_URI in Vercel Environment Variables.",
      });
    }

    return next();
  } catch (error) {
    return next(error);
  }
});

// API routes
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/stock", require("./routes/stockRoutes"));
app.use("/api/transactions", require("./routes/transactionRoutes"));
app.use("/api/lists", require("./routes/listRoutes"));
app.use("/api/export", require("./routes/exportRoutes"));
app.use("/api/dashboard", require("./routes/dashboardRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/import", require("./routes/importRoutes"));
app.use("/api/sections", require("./routes/sectionRoutes"));

// 404 handler
app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Server Error:", err);

  const status = err.status || err.statusCode || 500;

  return res.status(status).json({
    success: false,
    message: err.message || "Server Error",
    error: isProduction ? undefined : err.stack,
  });
});

// Local server only
if (require.main === module) {
  const PORT = process.env.PORT || 5000;

  connectDB()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
      });
    })
    .catch((error) => {
      console.error("Failed to start server:", error.message);
      process.exit(1);
    });
}

module.exports = app;