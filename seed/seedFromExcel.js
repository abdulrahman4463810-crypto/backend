require("dotenv").config();
const bcrypt = require("bcryptjs");
const connectDB = require("../config/db");
const User = require("../models/User");
const StockItem = require("../models/StockItem");
const Transaction = require("../models/Transaction");
const ListItem = require("../models/ListItem");
const { recalcStock } = require("../services/stockService");
const seed = require("./excelSeed.json");

async function run() {
  await connectDB();
  const hash = await bcrypt.hash("Sakb123456@", 10);
  await User.updateOne(
    { email: "abdulrahman4463810@gmail.com" },
    { $setOnInsert: { name: "Abdul Rahman", email: "abdulrahman4463810@gmail.com", password: hash, role: "superadmin", securityAnswer: "usman" } },
    { upsert: true }
  );

  for (const item of seed.stockItems || []) {
    await StockItem.updateOne(
      { itemCode: item.itemCode, category: item.category },
      { $setOnInsert: item },
      { upsert: true }
    );
  }

  for (const row of seed.dailyInward || []) {
    await Transaction.updateOne(
      { type: "inward", itemCode: row.itemCode, category: row.category, deliveryDate: row.deliveryDate, qtyReceived: row.qtyReceived },
      { $setOnInsert: { ...row, type: "inward" } },
      { upsert: true }
    );
  }

  for (const row of seed.dailyIssuance || []) {
    await Transaction.updateOne(
      { type: "issuance", itemCode: row.itemCode, category: row.category, date: row.date, qtyIssued: row.qtyIssued, equipmentName: row.equipmentName },
      { $setOnInsert: { ...row, type: "issuance" } },
      { upsert: true }
    );
  }

  for (const [group, values] of Object.entries(seed.lists || {})) {
    for (const value of values) {
      await ListItem.updateOne({ group, value }, { $setOnInsert: { group, value } }, { upsert: true });
    }
  }

  const items = await StockItem.find();
  for (const item of items) await recalcStock(item.itemCode, item.category);

  console.log("Excel seed completed");
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
