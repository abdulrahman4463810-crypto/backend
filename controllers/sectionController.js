const SectionRecord = require("../models/SectionRecord");
const audit = require("../services/auditService");
const {
  cleanText,
  compactKey,
  workbookFromBuffer,
  selectWorksheet,
  mapExcelRows,
  normalizeMonthlyTravel,
} = require("../utils/excelImport");

function cleanKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeParams(req) {
  return {
    sectionKey: cleanKey(req.params.sectionKey),
    pageKey: cleanKey(req.params.pageKey),
  };
}

function safeColumns(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeDataForPage(pageKey, data = {}) {
  const normalized = { ...data };
  if (pageKey === "monthly-travel-entries") return normalizeMonthlyTravel(normalized);
  return normalized;
}

function rowHasContent(row) {
  return row && Object.values(row).some(v => cleanText(v) !== "");
}

exports.getRecords = async (req, res, next) => {
  try {
    const { sectionKey, pageKey } = normalizeParams(req);
    const q = String(req.query.q || "").toLowerCase();
    let rows = await SectionRecord.find({ sectionKey, pageKey }).sort({ rowIndex: 1, createdAt: 1 });
    if (q) rows = rows.filter(r => JSON.stringify(r.data || {}).toLowerCase().includes(q));
    res.json(rows);
  } catch (e) { next(e); }
};

exports.createRecord = async (req, res, next) => {
  try {
    const { sectionKey, pageKey } = normalizeParams(req);
    const data = normalizeDataForPage(pageKey, req.body.data || req.body || {});
    const last = await SectionRecord.findOne({ sectionKey, pageKey }).sort({ rowIndex: -1 });
    const row = await SectionRecord.create({ sectionKey, pageKey, title: req.body.title || "", rowIndex: (last?.rowIndex || 0) + 1, data });
    await audit(req, "CREATE", `SECTION:${sectionKey}/${pageKey}`, row.toObject());
    res.status(201).json(row);
  } catch (e) { next(e); }
};

exports.updateRecord = async (req, res, next) => {
  try {
    const old = await SectionRecord.findById(req.params.id);
    if (!old) return res.status(404).json({ message: "Record not found" });
    const data = normalizeDataForPage(old.pageKey, req.body.data || req.body || {});
    const row = await SectionRecord.findByIdAndUpdate(req.params.id, { data }, { new: true, runValidators: true });
    await audit(req, "UPDATE", `SECTION:${row.sectionKey}/${row.pageKey}`, { id: row._id });
    res.json(row);
  } catch (e) { next(e); }
};

exports.deleteRecord = async (req, res, next) => {
  try {
    const row = await SectionRecord.findByIdAndDelete(req.params.id);
    if (!row) return res.status(404).json({ message: "Record not found" });
    await audit(req, "DELETE", `SECTION:${row.sectionKey}/${row.pageKey}`, row.toObject());
    res.json({ message: "Deleted" });
  } catch (e) { next(e); }
};

exports.deleteAll = async (req, res, next) => {
  try {
    const { sectionKey, pageKey } = normalizeParams(req);
    const result = await SectionRecord.deleteMany({ sectionKey, pageKey });
    await audit(req, "DELETE_ALL", `SECTION:${sectionKey}/${pageKey}`, { deleted: result.deletedCount });
    res.json({ message: "All records deleted", deleted: result.deletedCount });
  } catch (e) { next(e); }
};

exports.importRecords = async (req, res, next) => {
  try {
    const { sectionKey, pageKey } = normalizeParams(req);
    const columns = safeColumns(req.body.columns);
    let rows = Array.isArray(req.body.rows) ? req.body.rows : [];

    if (req.file?.buffer) {
      const wb = await workbookFromBuffer(req.file.buffer);
      const requestedSheet = req.body.sheetName;
      let ws = selectWorksheet(wb, requestedSheet);
      if (requestedSheet && (!ws || compactKey(ws.name) !== compactKey(requestedSheet))) {
        const pageGuess = compactKey(pageKey);
        ws = wb.worksheets.find(sheet => compactKey(sheet.name).includes(pageGuess) || pageGuess.includes(compactKey(sheet.name))) || ws;
      }
      if (!ws) return res.status(400).json({ message: "Excel sheet not found" });
      rows = mapExcelRows(ws, columns);
    }

    rows = rows
      .map(row => normalizeDataForPage(pageKey, row))
      .filter(rowHasContent);

    if (!rows.length) return res.status(400).json({ message: "No rows found in Excel file. Please check the sheet headings." });

    const last = await SectionRecord.findOne({ sectionKey, pageKey }).sort({ rowIndex: -1 });
    const start = last?.rowIndex || 0;
    const docs = rows.map((data, idx) => ({ sectionKey, pageKey, rowIndex: start + idx + 1, data }));
    const saved = await SectionRecord.insertMany(docs);
    await audit(req, "IMPORT", `SECTION:${sectionKey}/${pageKey}`, { count: saved.length });
    res.status(201).json({ message: "Imported successfully", imported: saved.length, sheet: req.body.sheetName || "First matched sheet" });
  } catch (e) { next(e); }
};
