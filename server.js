// Load .env only for local development.
// On Vercel, environment variables come from Vercel Dashboard.
if (!process.env.VERCEL) {
  require("dotenv").config();
}

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const connectDB = require("./config/db");

const app = express();

const isProduction =
  process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);

function normalizeOrigin(origin) {
  return String(origin || "").trim().replace(/\/+$/, "");
}

// Allowed frontend URLs
function allowedOrigins() {
  const envOrigins = String(
    process.env.CLIENT_URL || process.env.FRONTEND_URL || ""
  )
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);

  const defaultOrigins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://kolsonstore.netlify.app",
  ].map(normalizeOrigin);

  return [...new Set([...envOrigins, ...defaultOrigins])];
}

function hasMongoEnv() {
  return Boolean(process.env.MONGO_URI || process.env.MONGODB_URI);
}

// Vercel / proxy support
app.set("trust proxy", 1);

// Security headers
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// CORS setup
const corsOptions = {
  origin(origin, callback) {
    const origins = allowedOrigins();

    // Allow Postman, curl, server-to-server, same-origin requests
    if (!origin) {
      return callback(null, true);
    }

    const cleanOrigin = normalizeOrigin(origin);

    if (origins.includes(cleanOrigin)) {
      return callback(null, true);
    }

    console.error("CORS blocked origin:", cleanOrigin);
    console.error("Allowed origins:", origins);

    return callback(new Error(`CORS blocked this origin: ${cleanOrigin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

// Body parser
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// Logging
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
    skip: (req) => req.path === "/" || req.path === "/api/health",
    message: {
      success: false,
      message: "Too many requests. Please try again later.",
    },
  })
);

// Root route
app.get("/", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "LOTTE KOLSON STORE MANAGEMENT SYSTEM API RUNNING",
    status: "ok",
    platform: process.env.VERCEL ? "vercel" : "node",
    mongoUriDefined: Boolean(process.env.MONGO_URI),
    mongodbUriDefined: Boolean(process.env.MONGODB_URI),
    frontend: allowedOrigins(),
  });
});

// Health route
app.get("/api/health", async (req, res) => {
  try {
    const connection = await connectDB();
    const mongoEnvAvailable = hasMongoEnv();

    return res.status(200).json({
      success: true,
      status: "ok",
      database: connection ? "connected" : "not_connected",
      ownerSeed: connection
        ? "enabled"
        : mongoEnvAvailable
        ? "mongo_connection_failed"
        : "waiting_for_mongo_uri",
      mongoUriDefined: Boolean(process.env.MONGO_URI),
      mongodbUriDefined: Boolean(process.env.MONGODB_URI),
      platform: process.env.VERCEL ? "vercel" : "node",
    });
  } catch (error) {
    console.error("Health check failed:", error.message);

    return res.status(500).json({
      success: false,
      status: "error",
      database: "not_connected",
      message: error.message || "MongoDB health check failed",
      mongoUriDefined: Boolean(process.env.MONGO_URI),
      mongodbUriDefined: Boolean(process.env.MONGODB_URI),
      platform: process.env.VERCEL ? "vercel" : "node",
    });
  }
});

// MongoDB connection middleware for all API routes except health
app.use("/api", async (req, res, next) => {
  try {
    if (req.path === "/health") {
      return next();
    }

    const connection = await connectDB();

    if (!connection) {
      return res.status(500).json({
        success: false,
        message: hasMongoEnv()
          ? "MongoDB URI found, but database connection failed. Check Atlas password, database user permissions, and Network Access 0.0.0.0/0."
          : "MongoDB not connected. Add MONGO_URI or MONGODB_URI in Vercel Environment Variables.",
        mongoUriDefined: Boolean(process.env.MONGO_URI),
        mongodbUriDefined: Boolean(process.env.MONGODB_URI),
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
  console.error("Server Error:", err.message || err);

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
      app.listen(PORT, () => {
        console.log(`Server running without MongoDB on port ${PORT}`);
      });
    });
}

module.exports = app;
