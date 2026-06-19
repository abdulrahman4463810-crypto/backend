const mongoose = require("mongoose");

const DB_NAME = "lotte_kolson_store";

/*
  Vercel serverless me MongoDB connection cache zaroori hai,
  warna har request par new connection ban sakta hai.
*/
let cached = global.__LOTTE_KOLSON_DB_CACHE__;

if (!cached) {
  cached = global.__LOTTE_KOLSON_DB_CACHE__ = {
    conn: null,
    promise: null,
  };
}

function cleanMongoUri(value) {
  if (!value) return "";

  let uri = String(value).trim();

  // Agar galti se Vercel value me MONGO_URI= bhi paste ho gaya ho
  uri = uri.replace(/^MONGO_URI\s*=\s*/i, "").trim();
  uri = uri.replace(/^MONGODB_URI\s*=\s*/i, "").trim();

  // Quotes remove
  uri = uri.replace(/^["']|["']$/g, "").trim();

  // Agar galti se spaces aa gaye hon
  uri = uri.replace(/\s+/g, "");

  // Sirf valid MongoDB URI allow
  if (!uri.startsWith("mongodb://") && !uri.startsWith("mongodb+srv://")) {
    return "";
  }

  return uri;
}

function getMongoUri() {
  const uri = cleanMongoUri(process.env.MONGO_URI || process.env.MONGODB_URI);

  if (uri) return uri;

  // Local VS Code development ke liye fallback
  if (!process.env.VERCEL && process.env.NODE_ENV !== "production") {
    return `mongodb://127.0.0.1:27017/${DB_NAME}`;
  }

  return "";
}

async function connectDB() {
  const uri = getMongoUri();

  if (!uri) {
    console.error(
      "MongoDB connection failed: MONGO_URI or MONGODB_URI is missing/invalid in Environment Variables."
    );
    return null;
  }

  try {
    if (cached.conn && mongoose.connection.readyState === 1) {
      return cached.conn;
    }

    if (!cached.promise) {
      mongoose.set("strictQuery", true);

      cached.promise = mongoose.connect(uri, {
        dbName: DB_NAME,
        serverSelectionTimeoutMS: 15000,
        socketTimeoutMS: 45000,
        maxPoolSize: 10,
        minPoolSize: 0,
        family: 4,
      });
    }

    const mongooseInstance = await cached.promise;
    cached.conn = mongooseInstance.connection;

    console.log(`MongoDB Connected: ${cached.conn.host}/${DB_NAME}`);

    return cached.conn;
  } catch (error) {
    cached.conn = null;
    cached.promise = null;

    console.error("MongoDB connection failed:", error.message);

    return null;
  }
}

module.exports = connectDB;
