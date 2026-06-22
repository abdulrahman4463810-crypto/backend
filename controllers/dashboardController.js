const StockItem = require("../models/StockItem");
const Transaction = require("../models/Transaction");
const ListItem = require("../models/ListItem");

const CATEGORIES = ["Inventory", "Non Inventory", "Services", "Patty Cash"];

const MONTHS = [
  { key: "2026-05", label: "May-2026", month: 5, color: "#dc2626" },
  { key: "2026-06", label: "Jun-2026", month: 6, color: "#2563eb" },
  { key: "2026-07", label: "Jul-2026", month: 7, color: "#f59e0b" },
  { key: "2026-08", label: "Aug-2026", month: 8, color: "#16a34a" },
  { key: "2026-09", label: "Sep-2026", month: 9, color: "#7c3aed" },
  { key: "2026-10", label: "Oct-2026", month: 10, color: "#0891b2" },
  { key: "2026-11", label: "Nov-2026", month: 11, color: "#ea580c" },
  { key: "2026-12", label: "Dec-2026", month: 12, color: "#be123c" },
];

function n(value) {
  const num = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(num) ? num : 0;
}

function money(value) {
  return Math.round(n(value));
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function norm(value) {
  return cleanText(value).toLowerCase().replace(/\s+/g, " ");
}

function normalizeCategory(value) {
  const v = norm(value);

  if (v.includes("non")) return "Non Inventory";
  if (v.includes("service")) return "Services";
  if (v.includes("patty") || v.includes("petty") || v.includes("cash")) {
    return "Patty Cash";
  }

  return "Inventory";
}

function emptyCategoryValues() {
  return {
    Inventory: 0,
    "Non Inventory": 0,
    Services: 0,
    "Patty Cash": 0,
  };
}

function emptyMachineValues() {
  return {
    inventory: 0,
    nonInventory: 0,
    services: 0,
    pattyCash: 0,
  };
}

function getCategoryCssKey(category) {
  const c = normalizeCategory(category);

  if (c === "Non Inventory") return "nonInventory";
  if (c === "Services") return "services";
  if (c === "Patty Cash") return "pattyCash";

  return "inventory";
}

function isInwardType(type) {
  const t = norm(type);
  return t === "inward" || t.includes("inward");
}

function isIssuanceType(type) {
  const t = norm(type);
  return t === "issuance" || t.includes("issue") || t.includes("issuance");
}

function getAnyDate(row) {
  const value =
    row.date ||
    row.issueDate ||
    row.issuanceDate ||
    row.deliveryDate ||
    row.receivedDate ||
    row.createdAt ||
    row.updatedAt;

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) return null;

  return d;
}

function getMonthByDate(date) {
  if (!date) return null;

  const year = date.getFullYear();
  const month = date.getMonth() + 1;

  if (year !== 2026) return null;

  return MONTHS.find((m) => m.month === month) || null;
}

function getRowTotal(row) {
  const direct =
    row.total ??
    row.totalValue ??
    row.amount ??
    row.priceTotal ??
    row.issueTotal ??
    row.value;

  const directNum = n(direct);
  if (directNum) return directNum;

  const qty = n(
    row.qtyReceived ??
      row.receivedQty ??
      row.qtyIssued ??
      row.issueQty ??
      row.qty ??
      row.quantity
  );

  const price = n(row.unitPrice ?? row.price ?? row.rate);

  return qty * price;
}

function getIssuedQty(row) {
  return n(row.qtyIssued ?? row.issueQty ?? row.qty ?? row.quantity);
}

function getRawEquipment(row) {
  return (
    row.equipmentName ||
    row.equipment ||
    row.machineName ||
    row.machine ||
    row.machineNo ||
    row.machineNumber ||
    row.machineId ||
    row.equipmentId ||
    row.issuedMachine ||
    row.issuedToMachine ||
    row.sectionMachine ||
    ""
  );
}

function isEquipmentGroup(group) {
  const g = norm(group);

  return (
    g.includes("machine") ||
    g.includes("equipment") ||
    g.includes("equip") ||
    g.includes("machine name") ||
    g.includes("equipment name")
  );
}

async function buildEquipmentListAndMap() {
  const listRows = await ListItem.find().sort({
    group: 1,
    createdAt: 1,
    value: 1,
  });

  const equipmentList = [];
  const equipmentMap = {};
  const groupCounter = {};

  listRows.forEach((row) => {
    const group = cleanText(row.group);
    const value = cleanText(row.value);

    if (!group || !value) return;
    if (!isEquipmentGroup(group)) return;

    groupCounter[group] = (groupCounter[group] || 0) + 1;

    const no = groupCounter[group];

    equipmentList.push({
      no,
      id: String(row._id),
      _id: String(row._id),
      group,
      value,
      equipmentName: value,
      machineName: value,
    });

    equipmentMap[String(no)] = value;
    equipmentMap[norm(no)] = value;
    equipmentMap[String(row._id)] = value;
    equipmentMap[norm(row._id)] = value;
    equipmentMap[value] = value;
    equipmentMap[norm(value)] = value;
  });

  return { equipmentList, equipmentMap };
}

function resolveEquipmentName(rawValue, equipmentMap) {
  const raw = cleanText(rawValue);

  if (!raw) return "";

  const mapped = equipmentMap[raw] || equipmentMap[norm(raw)];
  if (mapped) return mapped;

  return "";
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
      {
        $group: {
          _id: "$category",
          items: { $sum: 1 },
          balance: { $sum: "$balanceQty" },
          value: { $sum: "$totalValue" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const transactions = await Transaction.find({}).lean();

    const stockMap = {};
    stock.forEach((row) => {
      stockMap[normalizeCategory(row._id)] = row;
    });

    const inwardMap = emptyCategoryValues();
    const issuanceMap = emptyCategoryValues();
    const inwardQtyMap = emptyCategoryValues();
    const issuanceQtyMap = emptyCategoryValues();

    const inwardMonth = {};
    const issuanceMonth = {};

    MONTHS.forEach((month) => {
      CATEGORIES.forEach((category) => {
        inwardMonth[`${month.key}-${category}`] = 0;
        issuanceMonth[`${month.key}-${category}`] = 0;
      });
    });

    transactions.forEach((tx) => {
      const type = cleanText(tx.type);
      const category = normalizeCategory(tx.category);
      const total = getRowTotal(tx);
      const date = getAnyDate(tx);
      const month = getMonthByDate(date);

      if (isInwardType(type)) {
        inwardMap[category] += total;
        inwardQtyMap[category] += n(tx.qtyReceived ?? tx.receivedQty ?? tx.qty);

        if (month) {
          inwardMonth[`${month.key}-${category}`] += total;
        }
      }

      if (isIssuanceType(type)) {
        issuanceMap[category] += total;
        issuanceQtyMap[category] += n(tx.qtyIssued ?? tx.issueQty ?? tx.qty);

        if (month) {
          issuanceMonth[`${month.key}-${category}`] += total;
        }
      }
    });

    const categorySummary = CATEGORIES.map((category) => {
      const stockRow = stockMap[category] || {};
      const gap = n(issuanceMap[category]) - n(inwardMap[category]);
      const s = signal(gap);

      return {
        category,
        items: n(stockRow.items),
        balance: n(stockRow.balance),
        stockValue: money(stockRow.value),
        inwardQty: money(inwardQtyMap[category]),
        issuanceQty: money(issuanceQtyMap[category]),
        inwardValue: money(inwardMap[category]),
        issuanceValue: money(issuanceMap[category]),
        gap: money(gap),
        signal: s,
        nextAction: actionFromSignal(s),
      };
    });

    const monthly = MONTHS.map((month) => {
      const inwardValues = {};
      const issuanceValues = {};

      CATEGORIES.forEach((category) => {
        inwardValues[category] = money(inwardMonth[`${month.key}-${category}`]);
        issuanceValues[category] = money(issuanceMonth[`${month.key}-${category}`]);
      });

      const inwardTotal = CATEGORIES.reduce(
        (sum, category) => sum + n(inwardValues[category]),
        0
      );

      const issuanceTotal = CATEGORIES.reduce(
        (sum, category) => sum + n(issuanceValues[category]),
        0
      );

      return {
        ...month,
        inwardValues,
        issuanceValues,
        inwardTotal: money(inwardTotal),
        issuanceTotal: money(issuanceTotal),
        gap: money(issuanceTotal - inwardTotal),
      };
    });

    const totalStockValue = categorySummary.reduce(
      (sum, row) => sum + n(row.stockValue),
      0
    );

    const totalInwardValue = categorySummary.reduce(
      (sum, row) => sum + n(row.inwardValue),
      0
    );

    const totalIssuanceValue = categorySummary.reduce(
      (sum, row) => sum + n(row.issuanceValue),
      0
    );

    const issuanceGap = totalIssuanceValue - totalInwardValue;

    const pressure =
      [...categorySummary].sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))[0] ||
      {};

    res.json({
      stock,
      totals: {
        inventoryStockValue:
          categorySummary.find((r) => r.category === "Inventory")?.stockValue || 0,
        nonInventoryStockValue:
          categorySummary.find((r) => r.category === "Non Inventory")?.stockValue || 0,
        servicesStockValue:
          categorySummary.find((r) => r.category === "Services")?.stockValue || 0,
        pattyCashStockValue:
          categorySummary.find((r) => r.category === "Patty Cash")?.stockValue || 0,
        totalStockValue: money(totalStockValue),
        totalInwardValue: money(totalInwardValue),
        totalIssuanceValue: money(totalIssuanceValue),
        totalItems: categorySummary.reduce((sum, row) => sum + n(row.items), 0),
        issuanceGap: money(issuanceGap),
      },
      quickBoard: [
        {
          label: "Issuance Gap",
          current: money(issuanceGap),
          signal: signal(issuanceGap),
          nextAction: actionFromSignal(signal(issuanceGap)),
          owner: "Store / Finance",
        },
        {
          label: "Top Pressure Category",
          current: pressure.category || "-",
          signal: pressure.signal || "OK",
          nextAction: pressure.nextAction || "Keep monitored",
          owner: "Procurement",
        },
        {
          label: "Month Data",
          current: monthly.filter(
            (m) => n(m.inwardTotal) > 0 || n(m.issuanceTotal) > 0
          ).length,
          signal: "Watch",
          nextAction: "Review month wise values",
          owner: "Reporting",
        },
      ],
      categorySummary,
      monthly,
      debug: {
        transactionsCount: transactions.length,
        inwardTotal: money(totalInwardValue),
        issuanceTotal: money(totalIssuanceValue),
      },
    });
  } catch (e) {
    next(e);
  }
};

exports.machine = async (req, res, next) => {
  try {
    const { equipmentList, equipmentMap } = await buildEquipmentListAndMap();

    const transactions = await Transaction.find({}).lean();

    const machines = new Map();

    equipmentList.forEach((equipment) => {
      const months = {};

      MONTHS.forEach((month) => {
        months[month.key] = {
          label: month.label,
          color: month.color,
          values: emptyCategoryValues(),
          machineValues: emptyMachineValues(),
          monthTotal: 0,
        };
      });

      machines.set(norm(equipment.equipmentName), {
        machine: equipment.equipmentName,
        machineName: equipment.equipmentName,
        equipmentName: equipment.equipmentName,
        listNo: equipment.no,
        listId: equipment.id,
        months,
        grandTotal: 0,
        totalQty: 0,
      });
    });

    transactions.forEach((tx) => {
      if (!isIssuanceType(tx.type)) return;

      const date = getAnyDate(tx);
      const month = getMonthByDate(date);
      if (!month) return;

      const rawEquipment = getRawEquipment(tx);
      const equipmentName = resolveEquipmentName(rawEquipment, equipmentMap);
      if (!equipmentName) return;

      const machineKey = norm(equipmentName);

      if (!machines.has(machineKey)) {
        const months = {};

        MONTHS.forEach((m) => {
          months[m.key] = {
            label: m.label,
            color: m.color,
            values: emptyCategoryValues(),
            machineValues: emptyMachineValues(),
            monthTotal: 0,
          };
        });

        machines.set(machineKey, {
          machine: equipmentName,
          machineName: equipmentName,
          equipmentName,
          listNo: null,
          listId: null,
          months,
          grandTotal: 0,
          totalQty: 0,
        });
      }

      const row = machines.get(machineKey);
      const category = normalizeCategory(tx.category);
      const cssKey = getCategoryCssKey(category);
      const total = money(getRowTotal(tx));
      const qty = getIssuedQty(tx);

      row.months[month.key].values[category] += total;
      row.months[month.key].machineValues[cssKey] += total;
      row.months[month.key].monthTotal += total;
      row.grandTotal += total;
      row.totalQty += qty;
    });

    const rows = [...machines.values()].sort((a, b) => {
      if (b.grandTotal !== a.grandTotal) return b.grandTotal - a.grandTotal;
      return a.machineName.localeCompare(b.machineName);
    });

    const monthlyTotals = MONTHS.map((month) => {
      const total = rows.reduce((sum, row) => {
        return sum + n(row.months[month.key]?.monthTotal);
      }, 0);

      return {
        ...month,
        total: money(total),
      };
    });

    const categoryTotals = emptyCategoryValues();

    rows.forEach((row) => {
      Object.values(row.months).forEach((month) => {
        CATEGORIES.forEach((category) => {
          categoryTotals[category] += n(month.values[category]);
        });
      });
    });

    const grandTotal = rows.reduce((sum, row) => sum + n(row.grandTotal), 0);

    res.json({
      months: MONTHS,
      categories: CATEGORIES,
      rows,
      monthlyTotals,
      grandTotal: money(grandTotal),
      categoryTotals,
      totalEquipment: equipmentList.length,
      activeEquipment: rows.filter((row) => n(row.grandTotal) > 0).length,
    });
  } catch (e) {
    next(e);
  }
};
