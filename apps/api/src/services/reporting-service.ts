import type {
  ImpactQuery,
  ImpactResponse,
  OutcomesResponse,
  ReportRangeQuery,
} from '@fedsa/contract';
import type { HandoverRepository, KgRow, OfferRepository } from '../db/index.js';
import { SA_OFFSET, dayRange } from './day-range.js';
import { roundKg, toMeals } from './meals.js';

/** one decimal place, and 0 rather than NaN for an empty period */
function percent(part: number, whole: number) {
  return whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10;
}

/**
 * impact reads handovers by the day the recipient confirmed. outcomes and the
 * offered totals read offers by the day they were posted
 */
export class ReportingService {
  private readonly handovers: HandoverRepository;
  private readonly offers: OfferRepository;

  constructor(handovers: HandoverRepository, offers: OfferRepository) {
    this.handovers = handovers;
    this.offers = offers;
  }

  /** the total is converted to meals on its own and can be more than the rows' meals added up */
  async monthlyImpact(query: ImpactQuery): Promise<ImpactResponse> {
    const groups = await this.handovers.collectedKgBy(
      query.groupBy,
      dayRange(query.from, query.to),
      SA_OFFSET,
    );
    const kg = roundKg(groups.reduce((sum, group) => sum + group.kg, 0));
    return {
      rows: groups.map((group) => ({
        key: group.key,
        label: group.label,
        kg: roundKg(group.kg),
        meals: toMeals(group.kg),
      })),
      totals: { kg, meals: toMeals(kg) },
    };
  }

  /** `claimedPct` is the share of posted offers a recipient claimed and did not release */
  async claimedVsExpired(query: ReportRangeQuery) {
    const counts = await this.offers.outcomeCounts(dayRange(query.from, query.to));
    const claimedAndKept = counts.claimed + counts.collected + counts.expiredClaimed;
    return { ...counts, claimedPct: percent(claimedAndKept, counts.posted) };
  }

  distinctRecipientsServed(query: ReportRangeQuery) {
    return this.offers.countRecipientsServed(dayRange(query.from, query.to));
  }

  async outcomes(query: ReportRangeQuery): Promise<OutcomesResponse> {
    const [counts, distinctRecipients] = await Promise.all([
      this.claimedVsExpired(query),
      this.distinctRecipientsServed(query),
    ]);
    return { ...counts, distinctRecipients };
  }

  /** what each donor put on offer. a split offer counts once, at its original quantity */
  async offeredByDonor(query: ReportRangeQuery): Promise<KgRow[]> {
    const groups = await this.offers.offeredKgByDonor(dayRange(query.from, query.to));
    return groups.map((group) => ({ ...group, kg: roundKg(group.kg) }));
  }
}
