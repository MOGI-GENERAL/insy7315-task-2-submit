import { z } from 'zod';
import { isoDay } from './common.js';

export const KG_PER_MEAL = 0.4;

export const ReportRangeQuery = z
  .object({ from: isoDay, to: isoDay })
  .refine((q) => q.from <= q.to, { path: ['to'], message: 'Must not be before the start date' });
export type ReportRangeQuery = z.infer<typeof ReportRangeQuery>;

export const ImpactGroupBy = z.enum(['month', 'donor', 'recipient']);
export type ImpactGroupBy = z.infer<typeof ImpactGroupBy>;

export const ImpactQuery = z
  .object({ from: isoDay, to: isoDay, groupBy: ImpactGroupBy.default('month') })
  .refine((q) => q.from <= q.to, { path: ['to'], message: 'Must not be before the start date' });
export type ImpactQuery = z.infer<typeof ImpactQuery>;

/** `key` is `YYYY-MM` when grouped by month, otherwise an organisation id */
export const ImpactRow = z.object({
  key: z.string(),
  label: z.string(),
  kg: z.number(),
  meals: z.number().int(),
});
export type ImpactRow = z.infer<typeof ImpactRow>;

export const ImpactResponse = z.object({
  rows: z.array(ImpactRow),
  totals: z.object({ kg: z.number(), meals: z.number().int() }),
});
export type ImpactResponse = z.infer<typeof ImpactResponse>;

/** `open`, `claimed`, `collected`, both expired counts and `cancelled` add up to `posted` */
export const OutcomesResponse = z.object({
  posted: z.number().int(),
  open: z.number().int(),
  claimed: z.number().int(),
  collected: z.number().int(),
  expiredUnclaimed: z.number().int(),
  expiredClaimed: z.number().int(),
  cancelled: z.number().int(),
  claimedPct: z.number(),
  distinctRecipients: z.number().int(),
});
export type OutcomesResponse = z.infer<typeof OutcomesResponse>;

export const ExportQuery = z
  .object({ from: isoDay, to: isoDay, format: z.enum(['csv', 'pdf']).default('csv') })
  .refine((q) => q.from <= q.to, { path: ['to'], message: 'Must not be before the start date' });
export type ExportQuery = z.infer<typeof ExportQuery>;
