import type { FoodCategory, TaxCertificateView } from '@fedsa/contract';
import PDFDocument from 'pdfkit';
import { FEDSA_LOGO_PATHS, FEDSA_LOGO_SIZE } from './fedsa-logo.js';

const TIME_ZONE = 'Africa/Johannesburg';
const MARGIN = 56;
const ROW_HEIGHT = 18;
const INK = '#1f2a24';
const MUTED = '#5b665f';
const RULE = '#c9d1cb';
const BRAND = '#244d2e';

const CATEGORY_LABELS: Record<FoodCategory, string> = {
  bakery: 'Bakery',
  produce: 'Fresh produce',
  dairy: 'Dairy',
  prepared: 'Prepared meals',
  dry: 'Dry goods',
  other: 'Other',
};

const rand = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' });
const kg = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 2 });
const longDate = new Intl.DateTimeFormat('en-ZA', {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export const formatRand = (value: number) => rand.format(value);
export const formatKg = (value: number) => `${kg.format(value)} kg`;
export const formatDate = (iso: string) => longDate.format(new Date(iso));

interface Column {
  label: string;
  width: number;
  align?: 'left' | 'right';
}

export function renderCertificatePdf(cert: TaxCertificateView): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: MARGIN,
    info: {
      Title: `Tax certificate ${cert.certificateNumber}`,
      Author: 'FEDSA',
      // fixed to the issue date so the same certificate always renders the same file
      CreationDate: new Date(cert.issuedAt),
    },
  });

  const done = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  drawHeader(doc, cert);
  drawDonor(doc, cert);
  if (cert.placeholderRates) drawPlaceholderNotice(doc);
  drawValuation(doc, cert);
  drawHandovers(doc, cert);
  drawFooter(doc, cert);

  doc.end();
  return done;
}

function contentWidth(doc: PDFKit.PDFDocument) {
  return doc.page.width - MARGIN * 2;
}

function ensureSpace(doc: PDFKit.PDFDocument, height: number) {
  if (doc.y + height > doc.page.height - MARGIN) doc.addPage();
}

function drawLogo(doc: PDFKit.PDFDocument, x: number, y: number, size: number) {
  doc.save();
  doc.translate(x, y).scale(size / FEDSA_LOGO_SIZE);
  for (const { fill, d } of FEDSA_LOGO_PATHS) doc.path(d).fill(fill);
  doc.restore();
}

function drawHeader(doc: PDFKit.PDFDocument, cert: TaxCertificateView) {
  const logoSize = 72;
  const textX = MARGIN + logoSize + 16;
  drawLogo(doc, MARGIN, MARGIN, logoSize);

  doc
    .fillColor(BRAND)
    .font('Helvetica-Bold')
    .fontSize(20)
    .text('Tax certificate', textX, MARGIN + 8);
  doc
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(10)
    .text('Food Excess Distribution South Africa (FEDSA)', textX, doc.y + 2);
  doc
    .fillColor(INK)
    .font('Helvetica-Bold')
    .fontSize(12)
    .text(`Certificate number ${cert.certificateNumber}`, textX, doc.y + 6);

  doc.x = MARGIN;
  doc.y = MARGIN + logoSize + 20;
  rule(doc);
}

function drawDonor(doc: PDFKit.PDFDocument, cert: TaxCertificateView) {
  const { donor } = cert;
  const rows: [string, string][] = [
    ['Donor', donor.name],
    ['Address', `${donor.addressLine}, ${donor.suburb}`],
    ['Tax reference number', donor.taxReferenceNumber ?? 'Not supplied'],
    ['Period', `${formatDate(cert.periodStart)} to ${formatDate(cert.periodEnd)}`],
    ['Issued', formatDate(cert.issuedAt)],
  ];

  doc.moveDown(0.5);
  for (const [label, value] of rows) {
    const y = doc.y;
    doc.fillColor(MUTED).font('Helvetica').fontSize(10).text(label, MARGIN, y, { width: 140 });
    doc
      .fillColor(INK)
      .font('Helvetica')
      .fontSize(10)
      .text(value, MARGIN + 150, y, { width: contentWidth(doc) - 150 });
    doc.moveDown(0.3);
  }
  doc.x = MARGIN;
  doc.moveDown(0.5);
}

function drawPlaceholderNotice(doc: PDFKit.PDFDocument) {
  const text =
    'Valuation rates are placeholders. The values below are not final and must not be used for a tax claim.';
  doc.font('Helvetica-Bold').fontSize(10);
  const height = doc.heightOfString(text, { width: contentWidth(doc) - 20 }) + 16;
  ensureSpace(doc, height);

  const y = doc.y;
  doc.rect(MARGIN, y, contentWidth(doc), height).fillAndStroke('#fdf1dc', '#cd882e');
  doc.fillColor('#7a4a0e').text(text, MARGIN + 10, y + 8, { width: contentWidth(doc) - 20 });
  doc.x = MARGIN;
  doc.y = y + height + 12;
}

function drawValuation(doc: PDFKit.PDFDocument, cert: TaxCertificateView) {
  sectionHeading(doc, 'Valuation by category');

  const width = contentWidth(doc);
  const columns: Column[] = [
    { label: 'Category', width: width * 0.34 },
    { label: 'Quantity', width: width * 0.2, align: 'right' },
    { label: 'Rate', width: width * 0.22, align: 'right' },
    { label: 'Value', width: width * 0.24, align: 'right' },
  ];

  tableRow(
    doc,
    columns,
    columns.map((c) => c.label),
    { bold: true, colour: MUTED },
  );
  rule(doc);
  for (const line of cert.valuationByCategory) {
    tableRow(doc, columns, [
      CATEGORY_LABELS[line.category],
      formatKg(line.quantityKg),
      `${formatRand(line.ratePerKg)} per kg`,
      formatRand(line.value),
    ]);
  }
  rule(doc);
  tableRow(
    doc,
    columns,
    ['Total', formatKg(cert.totalQuantityKg), '', formatRand(cert.totalValue)],
    { bold: true },
  );
  doc.moveDown(1);
}

function drawHandovers(doc: PDFKit.PDFDocument, cert: TaxCertificateView) {
  sectionHeading(doc, `Handovers covered (${cert.handovers.length})`);

  const width = contentWidth(doc);
  const columns: Column[] = [
    { label: 'Date', width: width * 0.4 },
    { label: 'Category', width: width * 0.36 },
    { label: 'Quantity', width: width * 0.24, align: 'right' },
  ];

  const handovers = [...cert.handovers].sort((a, b) => a.confirmedAt.localeCompare(b.confirmedAt));
  tableRow(
    doc,
    columns,
    columns.map((c) => c.label),
    { bold: true, colour: MUTED },
  );
  rule(doc);
  for (const handover of handovers) {
    tableRow(doc, columns, [
      formatDate(handover.confirmedAt),
      CATEGORY_LABELS[handover.category],
      formatKg(handover.quantityKg),
    ]);
  }
  doc.moveDown(1);
}

function drawFooter(doc: PDFKit.PDFDocument, cert: TaxCertificateView) {
  const text =
    `Issued by FEDSA on ${formatDate(cert.issuedAt)}. ` +
    'Every handover listed was confirmed by both the donor and the recipient, and appears on no other certificate.';
  doc.font('Helvetica').fontSize(9);
  ensureSpace(doc, doc.heightOfString(text, { width: contentWidth(doc) }) + 12);
  rule(doc);
  doc.fillColor(MUTED).text(text, MARGIN, doc.y + 4, { width: contentWidth(doc) });
}

function sectionHeading(doc: PDFKit.PDFDocument, text: string) {
  ensureSpace(doc, ROW_HEIGHT * 4);
  doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(12).text(text, MARGIN, doc.y);
  doc.moveDown(0.4);
}

function tableRow(
  doc: PDFKit.PDFDocument,
  columns: Column[],
  cells: string[],
  options: { bold?: boolean; colour?: string } = {},
) {
  ensureSpace(doc, ROW_HEIGHT);
  const y = doc.y;
  let x = MARGIN;
  doc
    .font(options.bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(10)
    .fillColor(options.colour ?? INK);
  columns.forEach((column, i) => {
    doc.text(cells[i] ?? '', x + 4, y + 4, {
      width: column.width - 8,
      align: column.align ?? 'left',
      lineBreak: false,
    });
    x += column.width;
  });
  doc.x = MARGIN;
  doc.y = y + ROW_HEIGHT;
}

function rule(doc: PDFKit.PDFDocument) {
  const y = doc.y + 2;
  doc
    .moveTo(MARGIN, y)
    .lineTo(doc.page.width - MARGIN, y)
    .lineWidth(0.75)
    .strokeColor(RULE)
    .stroke();
  doc.y = y + 4;
}
