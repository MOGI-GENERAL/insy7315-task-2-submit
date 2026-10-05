import { Link } from 'react-router-dom';
import type { ReportRangeQuery } from '@fedsa/contract';
import { BarChart } from '../../components/charts/BarChart';
import { Empty, LoadState } from '../../components/feedback';
import { Icon } from '../../components/Icon';
import { PageHead, Section, StatRow, StatTile } from '../../components/ui';
import { useData, useLoad } from '../../data';
import { fill } from '../../i18n/useFormat';
import { useT } from '../../i18n/useT';
import { formatNumber } from '../../lib/format';
import { byMonthAscending, formatPct, monthLabel } from './figures';
import { RangePicker } from './RangePicker';
import { ReportTable } from './ReportTable';
import { useRange } from './useRange';
import './Admin.css';

function Summary({ range, search }: { range: ReportRangeQuery; search: string }) {
  const { reports } = useData();
  const t = useT();
  const report = useLoad(async () => {
    const [impact, outcomes] = await Promise.all([
      reports.impact({ ...range, groupBy: 'month' }),
      reports.outcomes(range),
    ]);
    return { impact, outcomes };
  }, [reports, range]);

  return (
    <LoadState result={report}>
      {({ impact, outcomes }) => {
        const months = byMonthAscending(impact.rows);
        return (
          <>
            <StatRow>
              <StatTile
                icon="scale"
                label={t('rep.moved')}
                value={formatNumber(impact.totals.kg)}
                unit="kg"
                note={fill(t('rep.mealsNote'), { meals: formatNumber(impact.totals.meals) })}
                tone="good"
              />
              <StatTile
                icon="chart"
                label={t('rep.claimedPct')}
                value={formatPct(outcomes.claimedPct)}
                note={t('rep.claimedTarget')}
                tone={outcomes.claimedPct >= 75 ? 'good' : 'warn'}
              />
              <StatTile
                icon="people"
                label={t('rep.served')}
                value={formatNumber(outcomes.distinctRecipients)}
                note={t('rep.servedNote')}
              />
              <StatTile
                icon="list"
                label={t('rep.posted')}
                value={formatNumber(outcomes.posted)}
                note={t('rep.postedNote')}
              />
            </StatRow>

            <Section
              title={t('rep.monthsTitle')}
              lead={t('rep.monthsLead')}
              actions={
                <Link to={`/admin/kg-meals${search}`} className="btn btn--ghost">
                  {t('rep.fullReport')}
                </Link>
              }
            >
              {months.length === 0 ? (
                <Empty icon="chart" title={t('rep.noHandovers')} body={t('rep.noHandoversBody')} />
              ) : (
                <>
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
                </>
              )}
              <p className="muted">{t('rep.mealsRule')}</p>
            </Section>
          </>
        );
      }}
    </LoadState>
  );
}

export function ReportsHome() {
  const t = useT();
  const range = useRange();

  return (
    <>
      <PageHead title={t('rep.title')} lead={t('rep.lead')} />
      <RangePicker range={range} />
      {range.range && <Summary range={range.range} search={range.search} />}

      <Section
        title={t('rep.nextTitle')}
        actions={
          <Link to={`/admin/claimed-expired${range.search}`} className="btn btn--ghost">
            {t('rep.fullBreakdown')}
          </Link>
        }
      >
        <div className="admin-nav-grid">
          <Link to={`/admin/kg-meals${range.search}`} className="admin-nav-card">
            <Icon name="chart" size={24} />
            <span>{t('rep.navKg')}</span>
          </Link>
          <Link to={`/admin/claimed-expired${range.search}`} className="admin-nav-card">
            <Icon name="scale" size={24} />
            <span>{t('rep.navOutcomes')}</span>
          </Link>
          <Link to={`/admin/export${range.search}`} className="admin-nav-card">
            <Icon name="download" size={24} />
            <span>{t('rep.navExport')}</span>
          </Link>
          <Link to="/admin/certificates" className="admin-nav-card">
            <Icon name="file" size={24} />
            <span>{t('rep.navCertificates')}</span>
          </Link>
        </div>
      </Section>
    </>
  );
}
