import { password as passwordRule } from '@fedsa/contract';
import mongoose from 'mongoose';
import { seedPeriod } from './records.js';
import { parseArgs, targetRefusal } from './safety.js';
import { DONORS, MARIUS, NADIA, RECIPIENTS, ZANELE } from './scenario.js';
import { SeedRefusedError, runSeed } from './seed.js';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (typeof args === 'string') {
    console.error(args);
    return 1;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Refused: MONGODB_URI must be set');
    return 1;
  }
  const refusal = targetRefusal(args.env, uri, process.env.SEED_CONFIRM_HOST);
  if (refusal) {
    console.error(`Refused: ${refusal}. Nothing was changed`);
    return 1;
  }
  const password = passwordRule.safeParse(process.env.SEED_PASSWORD ?? '');
  if (!password.success) {
    console.error('Refused: SEED_PASSWORD must be set, between 10 and 72 characters');
    return 1;
  }

  await mongoose.connect(uri);
  try {
    const now = new Date();
    const results = await runSeed({ password: password.data, reset: args.reset, now });
    const { from, to } = seedPeriod(now);
    console.log(
      `Seeded ${mongoose.connection.name} for --env=${args.env}, history ${from} to ${to}`,
    );
    for (const r of results) {
      console.log(
        `  ${r.name}: ${r.total} records, ${r.inserted} new, ${r.updated} changed, ${r.deleted} removed`,
      );
    }
    const people = [...DONORS, ...RECIPIENTS].map((o) => o.person);
    console.log('Accounts, all with the password in SEED_PASSWORD:');
    for (const person of [NADIA, ZANELE, ...people, MARIUS]) {
      const disabled = person.status === 'disabled' ? ', disabled' : '';
      console.log(`  ${person.role}: ${person.email}${disabled}`);
    }
    return 0;
  } catch (err) {
    if (err instanceof SeedRefusedError) {
      console.error(`Refused: ${err.message}`);
      return 1;
    }
    throw err;
  } finally {
    await mongoose.disconnect();
  }
}

process.exitCode = await main();
