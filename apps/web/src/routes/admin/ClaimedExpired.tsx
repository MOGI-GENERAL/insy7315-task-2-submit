import type { ReportRangeQuery } from '@fedsa/contract';
import { BarChart } from '../../components/charts/BarChart';
import { LoadState } from '../../components/feedback';
import { PageHead, Section, StatRow, StatTile } from '../../components/ui';
import { useData, useLoad } from '../../data';
import { useT } from '../../i18n/useT';
import { formatNumber } from '../../lib/format';
import { formatPct } from './figures';
import { RangePicker } from './RangePicker';
import { ReportTable } from './ReportTable';
import { useRange } from './useRange';
import './Admin.css';

function Outcomes({ range }: { range: ReportRangeQuery }) {
  const { reports } = useData();
  const t = useT();
  const report = useLoad(() => reports.outcomes(range), [reports, range]);

  return (
    <LoadState result={report}>
      {(o) => {
        const rows = [
          { label: t('rep.outcomeOpen'), count: o.open },
          { label: t('rep.outcomeClaimed'), count: o.claimed },
          { label: t('rep.outcomeCollected'), count: o.collected },
          { label: t('rep.outcomeExpiredClaimed'), count: o.expiredClaimed },
          { label: t('rep.outcomeExpiredUnclaimed'), count: o.expiredUnclaimed },
          { label: t('rep.outcomeCancelled'), count: o.cancelled },
        ];
        return (
          <>
            <StatRow>
              <StatTile
                icon="chart"
                label={t('rep.claimedPct')}
                value={formatPct(o.claimedPct)}
                note={t('rep.claimedTarget')}
                tone={o.claimedPct >= 75 ? 'good' : 'warn'}
              />
              <StatTile
                icon="list"
                label={t('rep.posted')}
                value={formatNumber(o.posted)}
                note={t('rep.postedNote')}
              />
              <StatTile
                icon="check-circle"
                label={t('rep.collected')}
                value={formatNumber(o.collected)}
                tone="good"
              />
              <StatTile
                icon="alert"
                label={t('rep.expiredUnclaimed')}
                value={formatNumber(o.expiredUnclaimed)}
                tone={o.expiredUnclaimed > o.collected ? 'bad' : 'warn'}
              />
            </StatRow>

            <Section title={t('rep.outcomesSplit')}>
              <div className="panel">
                <BarChart
                  data={rows.map((row) => ({ label: row.label, value: row.count }))}
                  valueLabel={t('rep.colOffers')}
                  formatValue={formatNumber}
                />
              </div>
              <ReportTable
                caption={t('rep.outcomesTable')}
                head={[t('rep.colOutcome'), t('rep.colOffers')]}
                rows={rows.map((row) => [row.label, formatNumber(row.count)])}
                foot={[t('rep.total'), formatNumber(o.posted)]}
              />
            </Section>
          </>
        );
      }}
    </LoadState>
  );
}

export function ClaimedExpired() {
  const t = useT();
  const range = useRange();

  return (
    <>
      <PageHead title={t('rep.outcomesTitle')} lead={t('rep.outcomesLead')} />
      <RangePicker range={range} />
      {range.range && <Outcomes range={range.range} />}
    </>
  );
}
