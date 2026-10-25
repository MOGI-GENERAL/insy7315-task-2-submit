import mongoose from 'mongoose';
import { bootstrapDb } from '../db/index.js';
import { monthDays, previousMonth } from '../services/day-range.js';
import { createMonthlyCertificateService } from '../services/monthly-certificates.js';

async function main() {
  const month = process.argv[2] ?? previousMonth(new Date());
  try {
    monthDays(month);
  } catch (err) {
    console.error(`Refused: ${(err as Error).message}`);
    return 1;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Refused: MONGODB_URI must be set');
    return 1;
  }

  await mongoose.connect(uri);
  try {
    await bootstrapDb();
    const summary = await createMonthlyCertificateService().issueForMonth(month);
    console.log(`Certificates for ${summary.month}`);
    for (const row of summary.issued) {
      console.log(`  issued ${row.certificateNumber} to ${row.donorOrganisationId}`);
    }
    for (const row of summary.skipped) {
      console.log(`  skipped ${row.donorOrganisationId}: ${row.reason}`);
    }
    for (const row of summary.failed) {
      console.log(`  failed ${row.donorOrganisationId}: ${row.reason}`);
    }
    console.log(
      `${summary.issued.length} issued, ${summary.skipped.length} skipped, ${summary.failed.length} failed`,
    );
    return summary.failed.length > 0 ? 1 : 0;
  } finally {
    await mongoose.disconnect();
  }
}

process.exitCode = await main();
