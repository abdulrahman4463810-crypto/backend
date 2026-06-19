const mongoose = require("mongoose");

const DB_NAME = process.env.DB_NAME || "lotte_kolson_store";

/*
  Vercel serverless me MongoDB connection cache zaroori hota hai.
  Is se har request par new MongoDB connection create nahi hota.
*/
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

  // Agar Vercel value box me ghalti se MONGO_URI= ya MONGODB_URI= bhi paste ho gaya ho
  uri = uri.replace(/^MONGO_URI\s*=\s*/i, "").trim();
  uri = uri.replace(/^MONGODB_URI\s*=\s*/i, "").trim();

  // Quotes remove
  uri = uri.replace(/^["'`]|["'`]$/g, "").trim();

  // Agar string me URI se pehle koi extra text ho
  const firstMongoIndex = uri.search(/mongodb(\+srv)?:\/\//i);
  if (firstMongoIndex > 0) {
    uri = uri.slice(firstMongoIndex).trim();
  }

  // Agar ghalti se 2 MongoDB URI ek sath paste ho gaye hon, first URI use karo
  const secondMongoIndex = uri.slice(10).search(/mongodb(\+srv)?:\/\//i);
  if (secondMongoIndex !== -1) {
    uri = uri.slice(0, 10 + secondMongoIndex).trim();
  }

  // Spaces/new lines remove
  uri = uri.replace(/\s+/g, "");

  // Valid MongoDB URI check
  if (!uri.startsWith("mongodb://") && !uri.startsWith("mongodb+srv://")) {
    return "";
  }

  return uri;
}

function getMongoUri() {
  const uri = cleanMongoUri(process.env.MONGO_URI || process.env.MONGODB_URI);

  if (uri) return uri;

  // Sirf local VS Code development ke liye fallback
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
    } catch (error) {
      console.error("Owner super admin seed failed:", error.message);
    }
  })();

  return cached.ownerSeedPromise;
}

async function connectDB() {
  const uri = getMongoUri();

  // Vercel logs me sirf true/false show hoga, password/URI show nahi hoga
  console.log("Is MONGO_URI defined?", Boolean(process.env.MONGO_URI));
  console.log("Is MONGODB_URI defined?", Boolean(process.env.MONGODB_URI));

  if (!uri) {
    console.error(
      "MongoDB connection failed: MONGO_URI or MONGODB_URI is missing/invalid in Environment Variables."
    );
    return null;
  }

  try {
    // Already connected
    if (cached.conn && mongoose.connection.readyState === 1) {
      await seedOwnerOnce();
      return cached.conn;
    }

    // Connection already in progress
    if (cached.promise) {
      const existingConnection = await cached.promise;
      if (existingConnection) {
        await seedOwnerOnce();
      }
      return existingConnection;
    }

    mongoose.set("strictQuery", true);
    mongoose.set("bufferCommands", false);

    cached.promise = mongoose
      .connect(uri, {
        dbName: DB_NAME,
        serverSelectionTimeoutMS: 8000,
        connectTimeoutMS: 8000,
        socketTimeoutMS: 20000,
        maxPoolSize: 5,
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
        cached.conn = null;
        cached.promise = null;

        console.error("MongoDB connection failed:", error.message);

        return null;
      });

    return cached.promise;
  } catch (error) {
    cached.conn = null;
    cached.promise = null;

    console.error("MongoDB connection failed:", error.message);

    return null;
  }
}

module.exports = connectDB;
