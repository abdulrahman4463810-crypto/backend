const mongoose = require("mongoose");

const DB_NAME = "lotte_kolson_store";

// Vercel serverless me connection cache zaroori hota hai
let cached = global.__LOTTE_KOLSON_MONGO_CACHE__;

if (!cached) {
  cached = global.__LOTTE_KOLSON_MONGO_CACHE__ = {
    conn: null,
    promise: null,
    ownerSeedPromise: null,
  };
}

function cleanMongoUri(value) {
  if (!value) return "";

  let uri = String(value).trim();

  // Agar galti se value me MONGO_URI= bhi paste ho gaya ho
  uri = uri.replace(/^MONGO_URI\s*=\s*/i, "").trim();

  // Quotes remove
  uri = uri.replace(/^["']|["']$/g, "").trim();

  // Agar galti se 2 URI paste ho gaye hon, first valid URI use karega
  const firstMongoIndex = uri.indexOf("mongodb");
  if (firstMongoIndex > 0) {
    uri = uri.slice(firstMongoIndex).trim();
  }

  const secondMongoIndex = uri.indexOf(" mongodb", 10);
  if (secondMongoIndex !== -1) {
    uri = uri.slice(0, secondMongoIndex).trim();
  }

  if (!uri.startsWith("mongodb://") && !uri.startsWith("mongodb+srv://")) {
    return "";
  }

  return uri;
}

function getMongoUri() {
  const uri = cleanMongoUri(process.env.MONGO_URI || process.env.MONGODB_URI);

  if (uri) return uri;

  // Local development fallback only
  if (!process.env.VERCEL && process.env.NODE_ENV !== "production") {
    return `mongodb://127.0.0.1:27017/${DB_NAME}`;
  }

  return "";
}

async function seedOwnerOnce() {
  if (cached.ownerSeedPromise) return cached.ownerSeedPromise;

  cached.ownerSeedPromise = (async () => {
    try {
      const seedAdmin = require("../seedAdmin");
      await seedAdmin();
      console.log("Owner super admin seed checked");
    } catch (seedError) {
      console.error("Owner super admin seed failed:", seedError.message);
    }
  })();

  return cached.ownerSeedPromise;
}

async function connectDB() {
  const uri = getMongoUri();

  if (!uri) {
    console.error(
      "MongoDB connection failed: MONGO_URI is missing or invalid in Vercel Environment Variables."
    );
    return null;
  }

  if (cached.conn && mongoose.connection.readyState === 1) {
    await seedOwnerOnce();
    return cached.conn;
  }

  if (!cached.promise) {
    mongoose.set("strictQuery", true);

    cached.promise = mongoose
      .connect(uri, {
        dbName: DB_NAME,
        serverSelectionTimeoutMS: 15000,
        socketTimeoutMS: 45000,
        maxPoolSize: 10,
        minPoolSize: 0,
        family: 4,
      })
      .then(async (mongooseInstance) => {
        cached.conn = mongooseInstance.connection;
        console.log(`MongoDB Connected: ${cached.conn.host}/${DB_NAME}`);

        await seedOwnerOnce();

        return cached.conn;
      })
      .catch((error) => {
        cached.promise = null;
        cached.conn = null;

        console.error("MongoDB connection failed:", error.message);

        return null;
      });
  }

  return cached.promise;
}

module.exports = connectDB;