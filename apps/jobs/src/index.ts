import { createMonthlyCertificateService, previousMonth } from '@fedsa/api/certificates';
import { createExpiryService } from '@fedsa/api/expiry';
import { createRetentionService } from '@fedsa/api/retention';
import mongoose from 'mongoose';
import { pino } from 'pino';
import { dueJobs } from './schedule.js';

const logger = pino();

/** a failed job marks the run failed in Render without stopping the others */
async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    logger.fatal('MONGODB_URI must be set');
    return 1;
  }

  const now = new Date();
  const due = dueJobs(now);
  let failed = false;
  const run = async (name: string, job: () => Promise<object>) => {
    try {
      logger.info(await job(), name);
    } catch (err) {
      failed = true;
      logger.error({ err }, `${name} failed`);
    }
  };

  await mongoose.connect(uri);
  try {
    if (due.expiry) await run('expiry sweep', () => createExpiryService().expireOverdue(now));
    if (due.retention) await run('retention sweep', () => createRetentionService().sweep(now));
    if (due.certificates) {
      await run('monthly certificates', async () => {
        const summary = await createMonthlyCertificateService(process.env, logger).issueForMonth(
          previousMonth(now),
        );
        if (summary.failed.length > 0) failed = true;
        return summary;
      });
    }
  } finally {
    await mongoose.disconnect();
  }
  return failed ? 1 : 0;
}

process.exitCode = await main();
