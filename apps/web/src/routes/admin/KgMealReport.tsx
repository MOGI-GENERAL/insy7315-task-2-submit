import type { ImpactRow, ReportRangeQuery } from '@fedsa/contract';
import { BarChart } from '../../components/charts/BarChart';
import { Empty, LoadState } from '../../components/feedback';
import { PageHead, Section, StatRow, StatTile } from '../../components/ui';
import { useData, useLoad } from '../../data';
import { fill } from '../../i18n/useFormat';
import { useT } from '../../i18n/useT';
import { formatNumber } from '../../lib/format';
import { byMonthAscending, monthLabel } from './figures';
import { RangePicker } from './RangePicker';
import { ReportTable } from './ReportTable';
import { useRange } from './useRange';
import './Admin.css';

function RankList({ title, rows }: { title: string; rows: ImpactRow[] }) {
  const t = useT();
  const sorted = [...rows].sort((a, b) => b.kg - a.kg);
  const max = Math.max(1, ...sorted.map((row) => row.kg));
  return (
    <Section title={title} count={sorted.length}>
      <ul className="rank-list" aria-label={fill(t('rep.rankedBy'), { title })}>
        {sorted.map((row) => (
          <li className="rank-row" key={row.key}>
            <div className="rank-row__head">
              <span className="rank-row__label">
                <strong>{row.label}</strong>
              </span>
              <span className="rank-row__value">
                <span className="num">{formatNumber(row.kg)} kg</span>
                <span className="muted">
                  {fill(t('rep.mealsNote'), { meals: formatNumber(row.meals) })}
                </span>
              </span>
            </div>
            <span className="rank-bar-track">
              <span className="rank-bar-fill" style={{ width: `${(row.kg / max) * 100}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Impact({ range }: { range: ReportRangeQuery }) {
  const { reports } = useData();
  const t = useT();
  const report = useLoad(async () => {
    const [month, donor, recipient] = await Promise.all([
      reports.impact({ ...range, groupBy: 'month' }),
      reports.impact({ ...range, groupBy: 'donor' }),
      reports.impact({ ...range, groupBy: 'recipient' }),
    ]);
    return { month, donor, recipient };
  }, [reports, range]);

  return (
    <LoadState
      result={report}
      isEmpty={(d) => d.month.rows.length === 0}
      empty={<Empty icon="chart" title={t('rep.noHandovers')} body={t('rep.noHandoversBody')} />}
    >
      {({ month, donor, recipient }) => {
        const months = byMonthAscending(month.rows);
        return (
          <>
            <StatRow>
              <StatTile
                icon="scale"
                label={t('rep.colKg')}
                value={formatNumber(month.totals.kg)}
                unit="kg"
                tone="good"
              />
              <StatTile
                icon="chart"
                label={t('rep.colMeals')}
                value={formatNumber(month.totals.meals)}
                note={t('rep.mealsRule')}
              />
            </StatRow>

            <Section title={t('rep.monthsTitle')} count={months.length}>
              <div className="panel">
                <BarChart
                  data={months.map((row) => ({ label: monthLabel(row.key), value: row.kg }))}
                  valueLabel="kg"
                />
              </div>
              <ReportTable
                srOnly
                caption={t('rep.monthsChart')}
                head={[t('rep.colMonth'), t('rep.colKg'), t('rep.colMeals')]}
                rows={months.map((row) => [
                  monthLabel(row.key),
                  formatNumber(row.kg),
                  formatNumber(row.meals),
                ])}
              />
            </Section>

            <RankList title={t('rep.byDonor')} rows={donor.rows} />
            <RankList title={t('rep.byRecipient')} rows={recipient.rows} />
          </>
        );
      }}
    </LoadState>
  );
}

export function KgMealReport() {
  const t = useT();
  const range = useRange();

  return (
    <>
      <PageHead title={t('rep.kgTitle')} lead={t('rep.kgLead')} />
      <RangePicker range={range} />
      {range.range && <Impact range={range.range} />}
    </>
  );
}
