// File path: backend/services/reportService.js
// Purpose: Generates downloadable PDF reports from the same SQL-backed
// analytics data used elsewhere in the app — no separate data path, so
// reports always match what's shown on the Dashboard/Analytics pages.

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const analyticsService = require('./analyticsService');

const REPORTS_DIR = path.join(__dirname, '..', 'generated_reports');
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

const currency = (v) => `$${Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

function drawHeader(doc, title, datasetName) {
  doc.fontSize(20).fillColor('#1b2461').text('InsightAI', { continued: false });
  doc.fontSize(14).fillColor('#334155').text(title, { paragraphGap: 4 });
  doc.fontSize(10).fillColor('#64748b').text(`Dataset: ${datasetName}`);
  doc.text(`Generated: ${new Date().toLocaleString()}`);
  doc.moveDown(1);
  doc.strokeColor('#e2e8f0').moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(1);
}

function drawTable(doc, headers, rows, columnWidths) {
  const startX = 50;
  let y = doc.y;

  doc.fontSize(10).fillColor('#334155').font('Helvetica-Bold');
  headers.forEach((h, i) => {
    const x = startX + columnWidths.slice(0, i).reduce((a, b) => a + b, 0);
    doc.text(h, x, y, { width: columnWidths[i] });
  });
  y += 18;
  doc.moveTo(startX, y - 4).lineTo(545, y - 4).strokeColor('#e2e8f0').stroke();

  doc.font('Helvetica').fillColor('#475569');
  rows.forEach((row) => {
    if (y > 720) {
      doc.addPage();
      y = 50;
    }
    row.forEach((cell, i) => {
      const x = startX + columnWidths.slice(0, i).reduce((a, b) => a + b, 0);
      doc.text(String(cell), x, y, { width: columnWidths[i] });
    });
    y += 16;
  });
  doc.moveDown(2);
  doc.y = y + 10;
}

const reportBuilders = {
  async monthly_sales(doc, dataset) {
    const filters = { datasetId: dataset.id };
    const [kpis, monthlyTrend] = await Promise.all([
      analyticsService.getKpis(filters),
      analyticsService.getMonthlyTrend(filters),
    ]);

    drawHeader(doc, 'Monthly Sales Report', dataset.name);
    doc.fontSize(11).fillColor('#1e293b').text(
      `Total Revenue: ${currency(kpis.total_revenue)}   |   Total Profit: ${currency(kpis.total_profit)}   |   Total Orders: ${kpis.total_orders}`
    );
    doc.moveDown(1);
    drawTable(
      doc,
      ['Month', 'Sales', 'Profit', 'Orders'],
      monthlyTrend.map((m) => [m.month, currency(m.sales), currency(m.profit), m.orders]),
      [150, 130, 130, 90]
    );
  },

  async product_performance(doc, dataset) {
    const filters = { datasetId: dataset.id };
    const [topProducts, weakProducts, categoryPerformance] = await Promise.all([
      analyticsService.getTopProducts(filters, 15),
      analyticsService.getWeakProducts(filters, 10),
      analyticsService.getCategoryPerformance(filters),
    ]);

    drawHeader(doc, 'Product Performance Report', dataset.name);
    doc.fontSize(12).fillColor('#1e293b').text('Top Products by Revenue', { underline: false });
    doc.moveDown(0.5);
    drawTable(
      doc,
      ['Product', 'Category', 'Sales', 'Profit'],
      topProducts.map((p) => [p.product, p.category, currency(p.total_sales), currency(p.total_profit)]),
      [180, 120, 100, 100]
    );

    doc.fontSize(12).fillColor('#1e293b').text('Category Performance');
    doc.moveDown(0.5);
    drawTable(
      doc,
      ['Category', 'Sales', 'Profit', 'Orders'],
      categoryPerformance.map((c) => [c.category, currency(c.total_sales), currency(c.total_profit), c.orders]),
      [180, 120, 120, 80]
    );

    doc.fontSize(12).fillColor('#1e293b').text('Weakest Products by Profit');
    doc.moveDown(0.5);
    drawTable(
      doc,
      ['Product', 'Category', 'Sales', 'Profit'],
      weakProducts.map((p) => [p.product, p.category, currency(p.total_sales), currency(p.total_profit)]),
      [180, 120, 100, 100]
    );
  },

  async regional(doc, dataset) {
    const filters = { datasetId: dataset.id };
    const regionalPerformance = await analyticsService.getRegionalPerformance(filters);

    drawHeader(doc, 'Regional Performance Report', dataset.name);
    drawTable(
      doc,
      ['Region', 'Sales', 'Profit', 'Orders'],
      regionalPerformance.map((r) => [r.region, currency(r.total_sales), currency(r.total_profit), r.orders]),
      [150, 130, 130, 90]
    );
  },

  async customer(doc, dataset) {
    const filters = { datasetId: dataset.id };
    const [topCustomers, repeatCustomers, kpis] = await Promise.all([
      analyticsService.getTopCustomers(filters, 20),
      analyticsService.getRepeatCustomerCount(filters),
      analyticsService.getKpis(filters),
    ]);

    drawHeader(doc, 'Customer Report', dataset.name);
    doc.fontSize(11).fillColor('#1e293b').text(
      `Total Customers: ${kpis.total_customers}   |   Repeat Customers: ${repeatCustomers}`
    );
    doc.moveDown(1);
    drawTable(
      doc,
      ['Customer', 'Orders', 'Sales', 'Profit'],
      topCustomers.map((c) => [c.customer, c.orders, currency(c.total_sales), currency(c.total_profit)]),
      [180, 80, 120, 120]
    );
  },
};

const reportService = {
  VALID_TYPES: Object.keys(reportBuilders),

  async generatePdf({ dataset, reportType }) {
    if (!reportBuilders[reportType]) {
      throw new Error(`Unknown report type: ${reportType}`);
    }

    const fileName = `report_${dataset.id}_${reportType}_${Date.now()}.pdf`;
    const filePath = path.join(REPORTS_DIR, fileName);

    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    await reportBuilders[reportType](doc, dataset);

    doc.end();

    await new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    return { fileName, filePath };
  },

  getFilePath(fileName) {
    return path.join(REPORTS_DIR, fileName);
  },
};

module.exports = reportService;
