const StockItem = require("../models/StockItem");
const Transaction = require("../models/Transaction");

const CATEGORIES = ["Inventory", "Non Inventory", "Services", "Patty Cash"];
const MONTHS = [
  { key: "2026-05", label: "May-2026", month: 5 },
  { key: "2026-06", label: "Jun-2026", month: 6 },
  { key: "2026-07", label: "Jul-2026", month: 7 },
  { key: "2026-08", label: "Aug-2026", month: 8 },
  { key: "2026-09", label: "Sep-2026", month: 9 },
  { key: "2026-10", label: "Oct-2026", month: 10 },
  { key: "2026-11", label: "Nov-2026", month: 11 },
  { key: "2026-12", label: "Dec-2026", month: 12 },
];

function n(v) { return Number(v || 0); }
function money(v) { return Math.round(n(v)); }
function byCategoryMap(rows, valueKey = "total") {
  const map = Object.fromEntries(CATEGORIES.map(c => [c, 0]));
  rows.forEach(r => { map[r._id] = n(r[valueKey]); });
  return map;
}
function signal(gap) {
  if (gap > 0) return "Immediate";
  if (gap < 0) return "OK";
  return "Balanced";
}
function actionFromSignal(s) {
  if (s === "Immediate") return "Control outward issuance";
  if (s === "Balanced") return "Maintain normal flow";
  return "Keep monitored";
}

exports.master = async (req, res, next) => {
  try {
    const stock = await StockItem.aggregate([
      { $group: { _id: "$category", items: { $sum: 1 }, balance: { $sum: "$balanceQty" }, value: { $sum: "$totalValue" } } },
      { $sort: { _id: 1 } }
    ]);
    const inward = await Transaction.aggregate([
      { $match: { type: "inward" } },
      { $group: { _id: "$category", total: { $sum: "$total" }, qty: { $sum: "$qtyReceived" } } }
    ]);
    const issuance = await Transaction.aggregate([
      { $match: { type: "issuance" } },
      { $group: { _id: "$category", total: { $sum: "$total" }, qty: { $sum: "$qtyIssued" } } }
    ]);

    const stockMap = Object.fromEntries(stock.map(r => [r._id, r]));
    const inwardMap = byCategoryMap(inward);
    const issuanceMap = byCategoryMap(issuance);

    const categorySummary = CATEGORIES.map(category => {
      const stockRow = stockMap[category] || {};
      const gap = n(issuanceMap[category]) - n(inwardMap[category]);
      const s = signal(gap);
      return {
        category,
        items: n(stockRow.items),
        balance: n(stockRow.balance),
        stockValue: money(stockRow.value),
        inwardValue: money(inwardMap[category]),
        issuanceValue: money(issuanceMap[category]),
        gap: money(gap),
        signal: s,
        nextAction: actionFromSignal(s),
      };
    });

    const monthAgg = await Transaction.aggregate([
      { $match: { date: { $gte: new Date("2026-05-01"), $lt: new Date("2027-01-01") }, type: "issuance" } },
      { $group: { _id: { month: { $month: "$date" }, category: "$category" }, total: { $sum: "$total" } } }
    ]);
    const inwardMonthAgg = await Transaction.aggregate([
      { $match: { deliveryDate: { $gte: new Date("2026-05-01"), $lt: new Date("2027-01-01") }, type: "inward" } },
      { $group: { _id: { month: { $month: "$deliveryDate" }, category: "$category" }, total: { $sum: "$total" } } }
    ]);
    const issuanceMonth = {};
    monthAgg.forEach(r => { issuanceMonth[`${r._id.month}-${r._id.category}`] = n(r.total); });
    const inwardMonth = {};
    inwardMonthAgg.forEach(r => { inwardMonth[`${r._id.month}-${r._id.category}`] = n(r.total); });

    const monthly = MONTHS.map(m => {
      const inwardValues = {};
      const issuanceValues = {};
      CATEGORIES.forEach(c => {
        inwardValues[c] = money(inwardMonth[`${m.month}-${c}`]);
        issuanceValues[c] = money(issuanceMonth[`${m.month}-${c}`]);
      });
      const inwardTotal = Object.values(inwardValues).reduce((a, b) => a + b, 0);
      const issuanceTotal = Object.values(issuanceValues).reduce((a, b) => a + b, 0);
      return { ...m, inwardValues, issuanceValues, inwardTotal, issuanceTotal, gap: issuanceTotal - inwardTotal };
    });

    const machineAgg = await Transaction.aggregate([
      { $match: { type: "issuance" } },
      { $group: { _id: "$equipmentName", total: { $sum: "$total" } } },
      { $sort: { total: -1 } },
      { $limit: 5 }
    ]);

    const totalStockValue = categorySummary.reduce((s, r) => s + r.stockValue, 0);
    const totalInwardValue = categorySummary.reduce((s, r) => s + r.inwardValue, 0);
    const totalIssuanceValue = categorySummary.reduce((s, r) => s + r.issuanceValue, 0);
    const pressure = [...categorySummary].sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))[0] || {};
    const issuanceGap = totalIssuanceValue - totalInwardValue;

    res.json({
      stock,
      inward,
      issuance,
      totals: {
        inventoryStockValue: categorySummary.find(r => r.category === "Inventory")?.stockValue || 0,
        nonInventoryStockValue: categorySummary.find(r => r.category === "Non Inventory")?.stockValue || 0,
        totalStockValue,
        totalInwardValue,
        totalIssuanceValue,
        totalItems: categorySummary.reduce((s, r) => s + r.items, 0),
        issuanceGap,
      },
      quickBoard: [
        { label: "Issuance Gap", current: money(issuanceGap), signal: signal(issuanceGap), nextAction: actionFromSignal(signal(issuanceGap)), owner: "Store / Finance" },
        { label: "Top Pressure Category", current: pressure.category || "-", signal: pressure.signal || "OK", nextAction: pressure.nextAction || "Keep monitored", owner: "Procurement" },
        { label: "Machine Focus", current: machineAgg.length, signal: machineAgg.length >= 2 ? "Priority" : "Watch", nextAction: "Review focus machines", owner: "Maintenance" },
        { label: "Data Readiness", current: monthly.filter(m => m.issuanceTotal === 0 && m.inwardTotal === 0).length, signal: "Watch", nextAction: "Update future month data", owner: "Reporting" },
      ],
      categorySummary,
      monthly,
      machineFocus: machineAgg,
    });
  } catch (e) { next(e); }
};

exports.machine = async (req, res, next) => {
  try {
    const agg = await Transaction.aggregate([
      { $match: { type: "issuance", date: { $gte: new Date("2026-05-01"), $lt: new Date("2027-01-01") } } },
      { $group: { _id: { equipmentName: "$equipmentName", category: "$category", month: { $month: "$date" } }, total: { $sum: "$total" }, qty: { $sum: "$qtyIssued" } } },
      { $sort: { "_id.equipmentName": 1, "_id.month": 1 } }
    ]);

    const machines = new Map();
    agg.forEach(r => {
      const machine = r._id.equipmentName || "General";
      if (!machines.has(machine)) {
        machines.set(machine, { machine, months: {}, grandTotal: 0, totalQty: 0 });
        MONTHS.forEach(m => {
          machines.get(machine).months[m.key] = { label: m.label, values: Object.fromEntries(CATEGORIES.map(c => [c, 0])), monthTotal: 0 };
        });
      }
      const row = machines.get(machine);
      const month = MONTHS.find(m => m.month === r._id.month);
      if (!month) return;
      row.months[month.key].values[r._id.category] = money(r.total);
      row.months[month.key].monthTotal += money(r.total);
      row.grandTotal += money(r.total);
      row.totalQty += n(r.qty);
    });

    const rows = [...machines.values()].sort((a, b) => b.grandTotal - a.grandTotal);
    const grandTotal = rows.reduce((s, r) => s + r.grandTotal, 0);
    const categoryTotals = Object.fromEntries(CATEGORIES.map(c => [c, 0]));
    rows.forEach(r => Object.values(r.months).forEach(m => CATEGORIES.forEach(c => { categoryTotals[c] += n(m.values[c]); })));

    res.json({ months: MONTHS, categories: CATEGORIES, rows, grandTotal, categoryTotals });
  } catch (e) { next(e); }
};
