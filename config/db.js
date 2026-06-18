const mongoose = require("mongoose");

let cachedConnection = null;
let cachedPromise = null;
let ownerSeedPromise = null;

function getMongoUri() {
  return (
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    (!process.env.VERCEL && process.env.NODE_ENV !== "production" ? "mongodb://127.0.0.1:27017/lotte_kolson_store" : "")
  );
}

async function seedOwnerOnce() {
  if (ownerSeedPromise) return ownerSeedPromise;
  ownerSeedPromise = (async () => {
    try {
      const seedAdmin = require("../seedAdmin");
      await seedAdmin();
    } catch (seedError) {
      console.error("Owner super admin seed failed:", seedError.message);
    }
  })();
  return ownerSeedPromise;
}

async function connectDB() {
  const uri = getMongoUri();
  if (!uri) {
    console.error("MongoDB connection failed: MONGO_URI is missing. Add MONGO_URI in Vercel Environment Variables.");
    return null;
  }

  if (cachedConnection && mongoose.connection.readyState === 1) {
    await seedOwnerOnce();
    return cachedConnection;
  }

  if (!cachedPromise) {
    cachedPromise = mongoose
      .connect(uri, {
        serverSelectionTimeoutMS: 10000,
        bufferCommands: false,
      })
      .then((connection) => {
        cachedConnection = connection;
        console.log("MongoDB Connected");
        return connection;
      })
      .catch((error) => {
        cachedPromise = null;
        cachedConnection = null;
        console.error("MongoDB connection failed:", error.message);
        return null;
      });
  }

  const connection = await cachedPromise;
  if (connection) await seedOwnerOnce();
  return connection;
}

module.exports = connectDB;
