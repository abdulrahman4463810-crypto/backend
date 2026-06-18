const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const StockItem = require("../models/StockItem");
const Transaction = require("../models/Transaction");

function toRows(type, category) {
  if (type === "stock") return StockItem.find(category ? { category } : {});
  return Transaction.find({ type });
}

exports.exportExcel = async (req, res, next) => {
  try {
    const { type, category } = req.query;
    const data = await toRows(type, category);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Export");
    if (data[0]) ws.columns = Object.keys(data[0].toObject()).filter(k => !k.startsWith("_")).map(k => ({ header: k, key: k, width: 20 }));
    data.forEach(d => ws.addRow(d.toObject()));
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=export.xlsx");
    await wb.xlsx.write(res);
    res.end();
  } catch (e) { next(e); }
};

exports.exportPDF = async (req, res, next) => {
  try {
    const { type, category } = req.query;
    const data = await toRows(type, category);
    const doc = new PDFDocument({ margin: 30, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=report.pdf");
    doc.pipe(res);
    doc.fontSize(16).text("LOTTE KOLSON STORE MANAGEMENT SYSTEM", { align: "center" });
    doc.moveDown();
    data.slice(0, 80).forEach((r, i) => {
      const obj = r.toObject();
      doc.fontSize(9).text(`${i + 1}. ${obj.itemCode || ""} ${obj.itemDescription || ""} ${obj.category || ""} ${obj.balanceQty ?? obj.qtyReceived ?? obj.qtyIssued ?? ""}`);
    });
    doc.end();
  } catch (e) { next(e); }
};
