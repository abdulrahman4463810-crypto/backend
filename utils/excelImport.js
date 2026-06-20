const ExcelJS = require("exceljs");

function cleanText(value) {
  if (value === null || value === undefined) return "";

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "object") {
    if (value.text) return String(value.text).trim();

    if (value.result !== undefined) {
      return cleanText(value.result);
    }

    if (Array.isArray(value.richText)) {
      return value.richText.map((x) => x.text || "").join("").trim();
    }

    if (value.formula || value.sharedFormula) {
      return cleanText(value.result ?? "");
    }
  }

  return String(value).trim();
}

function normalizeKey(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[#.()/:\\-]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compactKey(value) {
  return normalizeKey(value).replace(/\s+/g, "");
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return 0;

  const n = Number(String(value).replace(/,/g, "").trim());

  return Number.isFinite(n) ? n : 0;
}

function monthNameFromDate(value) {
  if (!value) return "";

  const d = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(d.getTime())) return "";

  return d.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function dateValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  return cleanText(value);
}

async function workbookFromBuffer(buffer) {
  if (!buffer) {
    throw new Error("Excel file buffer is missing");
  }

  const wb = new ExcelJS.Workbook();

  await wb.xlsx.load(buffer);

  return wb;
}

function selectWorksheet(wb, requestedSheet) {
  const worksheets = Array.isArray(wb?.worksheets) ? wb.worksheets : [];

  if (!worksheets.length) {
    return null;
  }

  if (requestedSheet) {
    const exact =
      typeof wb.getWorksheet === "function"
        ? wb.getWorksheet(requestedSheet)
        : null;

    if (exact) return exact;

    const req = compactKey(requestedSheet);

    const fuzzy = worksheets.find((ws) => {
      const sheetKey = compactKey(ws.name);

      return (
        sheetKey === req ||
        sheetKey.includes(req) ||
        req.includes(sheetKey)
      );
    });

    if (fuzzy) return fuzzy;
  }

  return (
    worksheets.find((ws) => !String(ws.name || "").startsWith("_")) ||
    worksheets[0] ||
    null
  );
}

function rowCellText(row, idx) {
  const cell = row.getCell(idx);

  if (!cell) return "";

  return cleanText(cell.value);
}

function buildAliases(columns = []) {
  const aliases = new Map();

  const add = (alias, key) => {
    const n = compactKey(alias);

    if (n && !aliases.has(n)) {
      aliases.set(n, key);
    }
  };

  columns.forEach((col) => {
    add(col.key, col.key);
    add(col.label, col.key);
  });

  const common = {
    sr: "srNo",
    srno: "srNo",
    sn: "srNo",
    sno: "srNo",
    "sno.": "srNo",
    serialno: "srNo",
    serialnumber: "srNo",

    itemcode: "itemCode",
    code: "itemCode",
    itemno: "itemCode",
    itemnumber: "itemCode",
    servicescode: "itemCode",
    servicecode: "itemCode",
    pattycashcode: "itemCode",
    pettycashcode: "itemCode",

    itemdescription: "itemDescription",
    itemdesc: "itemDescription",
    itemname: "itemDescription",
    description: "itemDescription",
    servicesdescription: "itemDescription",
    servicedescription: "itemDescription",
    pattycashitemdescription: "itemDescription",
    pettycashitemdescription: "itemDescription",

    uom: "uom",
    unit: "uom",
    units: "uom",

    openingqty: "openingQty",
    opening: "openingQty",
    openqty: "openingQty",

    inwardqty: "inwardQty",
    inward: "inwardQty",
    qtyreceived: "inwardQty",

    issuedqty: "issuedQty",
    issued: "issuedQty",
    qtyissued: "issuedQty",

    balanceqty: "balanceQty",
    balance: "balanceQty",

    unitprice: "unitPrice",
    price: "unitPrice",
    rate: "unitPrice",

    totalvalue: "totalValue",
    total: "totalValue",
    amount: "totalValue",

    location: "location",
    rack: "location",
    rackno: "location",

    deliverydate: "deliveryDate",
    date: "Date",
    qty: "Qty",

    vendor: "vendorSupplier",
    vendorsupplier: "vendorSupplier",
    suppliervendor: "Supplier / Vendor",

    department: "department",
    receivedby: "receivedBy",
    issuedto: "issuedTo",

    equipmentname: "equipmentName",
    subequipmentname: "subEquipmentName",
    shift: "shift",

    grnstatuswithdate: "grnStatusWithDate",

    month: "Month",
    monthperiod: "Month Period",

    purpose: "Purpose / Justification of Visit",
    purposejustificationofvisit: "Purpose / Justification of Visit",

    fromlocation: "From Location",
    tomarketvendor: "To Market / Vendor",
    marketvendor: "To Market / Vendor",

    nooftrips: "No. of Trips",
    numberoftrips: "No. of Trips",

    goingdistkm: "Going Dist.(KM)",
    goingdistance: "Going Dist.(KM)",
    goingdistancekm: "Going Dist.(KM)",

    returndistkm: "Return Dist.(KM)",
    returndistance: "Return Dist.(KM)",
    returndistancekm: "Return Dist.(KM)",

    totaldistkm: "Total Dist.(KM)",
    totaldistancekm: "Total Dist.(KM)",
    totaldistance: "Total Dist.(KM)",

    fuelpaidrs: "Fuel Paid (Rs.)",
    fuelpaid: "Fuel Paid (Rs.)",

    fuelratersltr: "Fuel Rate (Rs./Ltr)",
    fuelrate: "Fuel Rate (Rs./Ltr)",

    petrolliters: "Petrol (Liters)",
    petrol: "Petrol (Liters)",
    totalltr: "Petrol (Liters)",

    totalfuel: "Total Fuel (Ltrs)",
    totalfuelltrs: "Total Fuel (Ltrs)",

    totalpricers: "Total Price (Rs.)",

    toolitemname: "TOOL / ITEM NAME",
    issuedate: "ISSUE DATE",
    replacement: "REPLACEMENT",
    remarkscondition: "REMARKS / CONDITION",
  };

  for (const [alias, key] of Object.entries(common)) {
    add(alias, key);
  }

  return aliases;
}

function headerScore(row, columns = []) {
  const aliases = buildAliases(columns);

  let score = 0;
  let filled = 0;

  for (let c = 1; c <= Math.max(row.cellCount || 0, 1); c += 1) {
    const text = rowCellText(row, c);

    if (!text) continue;

    filled += 1;

    if (aliases.has(compactKey(text))) score += 8;

    if (
      /date|month|qty|description|purpose|vendor|fuel|distance|uom|sr|code|price|balance|issued|inward/i.test(
        text
      )
    ) {
      score += 2;
    }
  }

  return { score, filled };
}

function findHeaderRow(ws, columns = []) {
  let best = {
    rowNumber: 1,
    score: -1,
    filled: 0,
  };

  const maxScan = Math.min(ws.rowCount || 60, 80);

  for (let r = 1; r <= maxScan; r += 1) {
    const row = ws.getRow(r);
    const current = headerScore(row, columns);

    if (
      current.score > best.score ||
      (current.score === best.score && current.filled > best.filled)
    ) {
      best = {
        rowNumber: r,
        ...current,
      };
    }
  }

  return best.rowNumber;
}

function rawCellValue(cell) {
  if (!cell) return "";

  const value = cell.value;

  if (value instanceof Date) {
    return dateValue(value);
  }

  if (typeof value === "object" && value?.result !== undefined) {
    return dateValue(value.result);
  }

  if (typeof value === "object" && (value?.formula || value?.sharedFormula)) {
    return dateValue(value.result ?? "");
  }

  return dateValue(value);
}

function mapExcelRows(ws, columns = [], opts = {}) {
  if (!ws) return [];

  const headerRowNo = opts.headerRow || findHeaderRow(ws, columns);
  const headerRow = ws.getRow(headerRowNo);

  const aliases = buildAliases(columns);
  const fallbackColumns = columns.map((c) => c.key || c.label).filter(Boolean);

  const colMap = [];
  const maxCol = Math.max(
    headerRow.cellCount || 0,
    ws.columnCount || 0,
    fallbackColumns.length
  );

  const duplicateCounter = new Map();

  for (let c = 1; c <= maxCol; c += 1) {
    const headerText = rowCellText(headerRow, c);
    const headerCompact = compactKey(headerText);

    let key = aliases.get(headerCompact);

    const configuredMatches = columns
      .map((col) => ({
        key: col.key,
        label: col.label || col.key,
      }))
      .filter(
        (col) =>
          compactKey(col.label) === headerCompact ||
          compactKey(col.key) === headerCompact
      );

    if (configuredMatches.length > 1) {
      const used = duplicateCounter.get(headerCompact) || 0;

      key = configuredMatches[Math.min(used, configuredMatches.length - 1)].key;

      duplicateCounter.set(headerCompact, used + 1);
    }

    if (!key && fallbackColumns[c - 1]) {
      key = fallbackColumns[c - 1];
    }

    if (!key && headerText) {
      key = headerText;
    }

    if (!key) continue;

    colMap.push({
      idx: c,
      key,
    });
  }

  const rows = [];
  let emptyRun = 0;

  for (let r = headerRowNo + 1; r <= (ws.rowCount || 0); r += 1) {
    const row = ws.getRow(r);
    const data = {};

    let filled = 0;

    colMap.forEach(({ idx, key }) => {
      const value = rawCellValue(row.getCell(idx));

      if (value !== "") filled += 1;

      data[key] = value;
    });

    if (!filled) {
      emptyRun += 1;

      if (emptyRun > 40) break;

      continue;
    }

    emptyRun = 0;

    const isRepeatedHeader =
      columns.length &&
      columns.some(
        (col) => compactKey(data[col.key]) === compactKey(col.label || col.key)
      );

    const configuredValues = !columns.length
      ? Object.values(data)
      : columns.map((col) => data[col.key]);

    const usefulValues = configuredValues.filter(
      (v) =>
        v !== undefined &&
        v !== "" &&
        !columns.some(
          (col) => compactKey(v) === compactKey(col.label || col.key)
        )
    );

    const configuredFilledCount = usefulValues.length;

    const uniqueUseful = Array.from(
      new Set(usefulValues.map((v) => compactKey(v)))
    ).filter(Boolean);

    const isMergedTitleRow =
      configuredFilledCount > 2 && uniqueUseful.length === 1;

    const hasUsefulConfiguredData =
      !columns.length || configuredFilledCount >= 2;

    if (!isRepeatedHeader && !isMergedTitleRow && hasUsefulConfiguredData) {
      rows.push(data);
    }
  }

  return rows;
}

function normalizeMonthlyTravel(row) {
  const out = { ...row };

  const date = out.Date || out.date || out.deliveryDate || "";

  if (date) {
    out.Date = dateValue(date);
  }

  if (!out.Month) {
    out.Month = monthNameFromDate(out.Date);
  }

  const going = toNumber(
    out["Going Dist.(KM)"] ?? out.goingDistance ?? out.goingDist
  );

  const ret = toNumber(
    out["Return Dist.(KM)"] ?? out.returnDistance ?? out.returnDist
  );

  const fuelPaid = toNumber(out["Fuel Paid (Rs.)"] ?? out.fuelPaid);
  const fuelRate = toNumber(out["Fuel Rate (Rs./Ltr)"] ?? out.fuelRate);

  out["Going Dist.(KM)"] = going;
  out["Return Dist.(KM)"] = ret;
  out["Total Dist.(KM)"] = Number((going + ret).toFixed(2));
  out["Fuel Paid (Rs.)"] = fuelPaid;
  out["Fuel Rate (Rs./Ltr)"] = fuelRate;
  out["Petrol (Liters)"] = fuelRate
    ? Number((fuelPaid / fuelRate).toFixed(3))
    : 0;

  out["No. of Trips"] = toNumber(out["No. of Trips"] ?? out.trips);

  return out;
}

module.exports = {
  cleanText,
  normalizeKey,
  compactKey,
  toNumber,
  dateValue,
  monthNameFromDate,
  workbookFromBuffer,
  selectWorksheet,
  mapExcelRows,
  normalizeMonthlyTravel,
};
