const XLSX = require("xlsx");

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

  if (typeof value === "object" && value.result !== undefined) {
    value = value.result;
  }

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

  const raw = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
    cellNF: false,
    cellText: false,
  });

  const sheetNames = Array.isArray(raw.SheetNames) ? raw.SheetNames : [];

  const worksheets = sheetNames.map((name) => {
    const sheet = raw.Sheets[name];

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: true,
      blankrows: false,
    });

    return {
      name,
      rows,
      rowCount: rows.length,
      columnCount: rows.reduce(
        (max, row) => Math.max(max, Array.isArray(row) ? row.length : 0),
        0
      ),
    };
  });

  return {
    raw,
    SheetNames: sheetNames,
    worksheets,

    getWorksheet(name) {
      const requested = compactKey(name);

      return (
        worksheets.find((ws) => compactKey(ws.name) === requested) || null
      );
    },
  };
}

function selectWorksheet(wb, requestedSheet) {
  const worksheets = Array.isArray(wb?.worksheets) ? wb.worksheets : [];

  if (!worksheets.length) return null;

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

function buildAliases(columns = []) {
  const aliases = new Map();

  const add = (alias, key) => {
    const n = compactKey(alias);

    if (n && key && !aliases.has(n)) {
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
    serialno: "srNo",

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
    qtyreceived: "qtyReceived",

    issuedqty: "issuedQty",
    issued: "issuedQty",
    qtyissued: "qtyIssued",

    balanceqty: "balanceQty",
    balance: "balanceQty",

    unitprice: "unitPrice",
    price: "unitPrice",
    rate: "unitPrice",

    totalvalue: "totalValue",
    total: "total",
    amount: "total",

    location: "location",
    rack: "location",
    rackno: "location",

    deliverydate: "deliveryDate",
    date: "date",
    issuedate: "date",

    qty: "Qty",
    quantity: "Qty",

    vendor: "vendorSupplier",
    supplier: "vendorSupplier",
    vendorsupplier: "vendorSupplier",
    suppliervendor: "vendorSupplier",

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
    replacement: "REPLACEMENT",
    remarkscondition: "REMARKS / CONDITION",
  };

  for (const [alias, key] of Object.entries(common)) {
    add(alias, key);
  }

  return aliases;
}

function headerScore(row = [], columns = []) {
  const aliases = buildAliases(columns);

  let score = 0;
  let filled = 0;

  for (const cell of row) {
    const text = cleanText(cell);

    if (!text) continue;

    filled += 1;

    if (aliases.has(compactKey(text))) {
      score += 8;
    }

    if (
      /date|month|qty|quantity|description|purpose|vendor|supplier|fuel|distance|uom|sr|code|price|balance|issued|inward/i.test(
        text
      )
    ) {
      score += 2;
    }
  }

  return {
    score,
    filled,
  };
}

function findHeaderRow(rows = [], columns = []) {
  let best = {
    rowIndex: 0,
    score: -1,
    filled: 0,
  };

  const maxScan = Math.min(rows.length || 60, 80);

  for (let i = 0; i < maxScan; i += 1) {
    const current = headerScore(rows[i] || [], columns);

    if (
      current.score > best.score ||
      (current.score === best.score && current.filled > best.filled)
    ) {
      best = {
        rowIndex: i,
        ...current,
      };
    }
  }

  return best.rowIndex;
}

function isRepeatedHeaderRow(data, columns = []) {
  if (!columns.length) return false;

  let matched = 0;

  for (const col of columns) {
    const value = data[col.key];
    const expected = col.label || col.key;

    if (compactKey(value) && compactKey(value) === compactKey(expected)) {
      matched += 1;
    }
  }

  return matched >= 2;
}

function isMergedTitleRow(values = []) {
  const usefulValues = values.filter((v) => cleanText(v) !== "");

  if (usefulValues.length <= 2) return false;

  const uniqueUseful = Array.from(
    new Set(usefulValues.map((v) => compactKey(v)))
  ).filter(Boolean);

  return uniqueUseful.length === 1;
}

function rowHasAnyFilledCell(row = []) {
  return row.some((value) => cleanText(value) !== "");
}

function mapExcelRows(ws, columns = [], opts = {}) {
  if (!ws) return [];

  const rowsArray = Array.isArray(ws.rows) ? ws.rows : [];

  if (!rowsArray.length) return [];

  const headerIndex =
    typeof opts.headerRow === "number"
      ? Math.max(opts.headerRow - 1, 0)
      : findHeaderRow(rowsArray, columns);

  const headerRow = rowsArray[headerIndex] || [];

  const aliases = buildAliases(columns);
  const fallbackColumns = columns.map((c) => c.key || c.label).filter(Boolean);

  const maxCol = Math.max(
    headerRow.length,
    ws.columnCount || 0,
    fallbackColumns.length
  );

  const colMap = [];

  for (let c = 0; c < maxCol; c += 1) {
    const headerText = cleanText(headerRow[c]);
    const headerCompact = compactKey(headerText);

    let key = aliases.get(headerCompact);

    if (!key && fallbackColumns[c]) {
      key = fallbackColumns[c];
    }

    if (!key && headerText) {
      key = headerText;
    }

    if (!key) continue;

    colMap.push({
      index: c,
      key,
    });
  }

  const mappedRows = [];
  let emptyRun = 0;

  for (let r = headerIndex + 1; r < rowsArray.length; r += 1) {
    const row = rowsArray[r] || [];
    const data = {};

    const rawRowFilled = rowHasAnyFilledCell(row);

    let configuredFilled = 0;

    colMap.forEach(({ index, key }) => {
      const value = dateValue(row[index]);

      if (cleanText(value) !== "") {
        configuredFilled += 1;
      }

      data[key] = value;
    });

    if (!rawRowFilled && !configuredFilled) {
      emptyRun += 1;

      if (emptyRun > 120) {
        break;
      }

      continue;
    }

    emptyRun = 0;

    const configuredValues = !columns.length
      ? Object.values(data)
      : columns.map((col) => data[col.key]);

    const usefulValues = configuredValues.filter((value) => {
      const text = cleanText(value);

      if (!text) return false;

      const sameAsHeader = columns.some(
        (col) => compactKey(text) === compactKey(col.label || col.key)
      );

      return !sameAsHeader;
    });

    const hasUsefulConfiguredData =
      !columns.length || usefulValues.length >= 1 || rawRowFilled;

    if (
      !isRepeatedHeaderRow(data, columns) &&
      !isMergedTitleRow(configuredValues) &&
      hasUsefulConfiguredData
    ) {
      data.__rowNumber = r + 1;
      mappedRows.push(data);
    }
  }

  return mappedRows;
}

function normalizeMonthlyTravel(row) {
  const out = {
    ...row,
  };

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
