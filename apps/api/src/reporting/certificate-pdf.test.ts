import { mkdir, writeFile } from 'node:fs/promises';
import { TaxCertificateView } from '@fedsa/contract';
import { PDFParse } from 'pdf-parse';
import { describe, expect, test } from 'vitest';
import { formatRand, renderCertificatePdf } from './certificate-pdf.js';

const id = (n: number) => n.toString(16).padStart(24, '0');

const handovers = [
  ['2026-09-02T08:15:00.000Z', 'bakery', 12],
  ['2026-09-05T13:40:00.000Z', 'produce', 25],
  ['2026-09-09T09:05:00.000Z', 'bakery', 15],
  ['2026-09-12T15:30:00.000Z', 'prepared', 20],
  ['2026-09-18T07:50:00.000Z', 'produce', 37.5],
  ['2026-09-26T10:20:00.000Z', 'bakery', 13],
] as const;

const fixture = TaxCertificateView.parse({
  id: id(1),
  certificateNumber: 'FEDSA-2026-0001',
  donorOrganisationId: id(2),
  periodStart: '2026-08-31T22:00:00.000Z',
  periodEnd: '2026-09-30T21:59:59.999Z',
  handoverRecordIds: handovers.map((_, i) => id(100 + i)),
  totalQuantityKg: 122.5,
  valuationByCategory: [
    { category: 'bakery', quantityKg: 40, ratePerKg: 25, value: 1000 },
    { category: 'produce', quantityKg: 62.5, ratePerKg: 18, value: 1125 },
    { category: 'prepared', quantityKg: 20, ratePerKg: 45, value: 900 },
  ],
  totalValue: 3025,
  issuedAt: '2026-10-02T09:00:00.000Z',
  donor: {
    name: "Ouma's Bakery",
    addressLine: '14 Kerk Street',
    suburb: 'Stellenbosch Central',
    taxReferenceNumber: '9012345678',
  },
  handovers: handovers.map(([confirmedAt, category, quantityKg], i) => ({
    id: id(100 + i),
    confirmedAt,
    category,
    quantityKg,
  })),
  placeholderRates: false,
});

async function extract(pdf: Buffer) {
  const parser = new PDFParse({ data: new Uint8Array(pdf) });
  try {
    const result = await parser.getText();
    // en-ZA groups digits with a no-break space, which extraction may turn into a plain one
    return { text: result.text.replace(/\s+/g, ' '), pages: result.total };
  } finally {
    await parser.destroy();
  }
}

const normalise = (s: string) => s.replace(/\s+/g, ' ');

describe('renderCertificatePdf', () => {
  test('renders a PDF with the certificate number and total', async () => {
    const pdf = await renderCertificatePdf(fixture);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');

    const { text } = await extract(pdf);
    expect(text).toContain('FEDSA-2026-0001');
    expect(text).toContain(normalise(formatRand(3025)));
    expect(text).toContain('9012345678');
    expect(text).not.toContain('placeholders');
  });

  test('shows the placeholder notice while the rates are placeholders', async () => {
    const pdf = await renderCertificatePdf({ ...fixture, placeholderRates: true });
    const { text } = await extract(pdf);
    expect(text).toContain('Valuation rates are placeholders');
  });

  test('says so when the donor has no tax reference number', async () => {
    const pdf = await renderCertificatePdf({
      ...fixture,
      donor: { ...fixture.donor, taxReferenceNumber: null },
    });
    const { text } = await extract(pdf);
    expect(text).toContain('Not supplied');
  });

  test('runs a long handover list onto further pages', async () => {
    const many = Array.from({ length: 120 }, (_, i) => ({
      ...fixture.handovers[0],
      id: id(1000 + i),
    }));
    const pdf = await renderCertificatePdf({ ...fixture, handovers: many });
    const { text, pages } = await extract(pdf);
    expect(pages).toBeGreaterThan(1);
    expect(text).toContain('Handovers covered (120)');
  });

  test('renders the same bytes for the same certificate', async () => {
    const [a, b] = await Promise.all([
      renderCertificatePdf(fixture),
      renderCertificatePdf(fixture),
    ]);
    expect(a.equals(b)).toBe(true);
  });

  // WRITE_CERTIFICATE_SAMPLE=1 npm run test:unit -w @fedsa/api
  test.runIf(process.env.WRITE_CERTIFICATE_SAMPLE)(
    'writes the sample to docs/samples',
    async () => {
      const dir = new URL('../../../../docs/samples/', import.meta.url);
      await mkdir(dir, { recursive: true });
      const pdf = await renderCertificatePdf({ ...fixture, placeholderRates: true });
      await writeFile(new URL('tax-certificate-sample.pdf', dir), pdf);
    },
  );
});
