require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const connectDB = require("./config/db");

const app = express();
const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL;

function allowedOrigins() {
  return String(process.env.CLIENT_URL || process.env.FRONTEND_URL || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

app.set("trust proxy", 1);
app.use(helmet());
const corsOptions = {
  origin(origin, callback) {
    const origins = allowedOrigins();
    if (!origin || origins.length === 0 || origins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked this origin: ${origin}`));
  },
  credentials: true,
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json({ limit: "20mb" }));
if (!isProduction) app.use(morgan("dev"));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 1000, standardHeaders: true, legacyHeaders: false }));

app.get("/", (req, res) => {
  res.json({
    message: "LOTTE KOLSON STORE MANAGEMENT SYSTEM API RUNNING",
    status: "ok",
    platform: process.env.VERCEL ? "vercel" : "node",
  });
});

app.get("/api/health", async (req, res) => {
  const connection = await connectDB();
  res.json({
    status: "ok",
    database: connection ? "connected" : "not_connected",
    ownerSeed: connection ? "enabled" : "waiting_for_mongo_uri",
  });
});

// On Vercel/serverless, make sure MongoDB is connected before API handlers run.
app.use("/api", async (req, res, next) => {
  try {
    const connection = await connectDB();
    if (!connection) {
      return res.status(500).json({
        message: "MongoDB not connected. Add a valid MONGO_URI in Vercel Environment Variables.",
      });
    }
    return next();
  } catch (error) {
    return next(error);
  }
});

app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/stock", require("./routes/stockRoutes"));
app.use("/api/transactions", require("./routes/transactionRoutes"));
app.use("/api/lists", require("./routes/listRoutes"));
app.use("/api/export", require("./routes/exportRoutes"));
app.use("/api/dashboard", require("./routes/dashboardRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/import", require("./routes/importRoutes"));
app.use("/api/sections", require("./routes/sectionRoutes"));

app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
});

app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ message: err.message || "Server Error" });
});

if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  connectDB().finally(() => {
    app.listen(PORT, () => console.log(`Server running on ${PORT}`));
  });
}

module.exports = app;
