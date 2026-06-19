const mongoose = require("mongoose");

async function connectDB() {
  const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/lotte_kolson_store";
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    console.log("MongoDB Connected");
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    console.error("Backend is still running. Add a valid MONGO_URI in backend/.env, then restart the server.");
  }
}

module.exports = connectDB;
