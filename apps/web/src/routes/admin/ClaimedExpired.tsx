/* CLAIM RATE REPORT: TARGET >75% CLAIMED (CURRENT EST. 60-70%) */

import { BarChart } from '../../components/charts/BarChart';
import { SplitBar } from '../../components/charts/SplitBar';
import { PageHead, Section, StatRow, StatTile } from '../../components/ui';
import { useAppState } from '../../store/context';
import { byMonth, headline } from '../../store/selectors';
import { formatNumber, formatPercent } from '../../lib/format';
import './Admin.css';

export function ClaimedExpired() {
  const state = useAppState();
  const stats = headline(state);
  const months = byMonth(state, 6);

  return (
    <>
      <PageHead
        title="Claimed versus expired"
        lead="FEDSA's own target is above 75% claimed, against a current estimate of 60 to 70%."
      />

      <StatRow>
        <StatTile
          icon="check-circle"
          label="Claimed and collected"
          value={String(stats.collected)}
          note="Offers, all time"
          tone="good"
        />
        <StatTile
          icon="alert"
          label="Expired unclaimed"
          value={String(stats.expired)}
          note="Offers, all time"
          tone={stats.expired > stats.collected ? 'bad' : 'warn'}
        />
        <StatTile
          icon="chart"
          label="Claim rate"
          value={formatPercent(stats.claimRate)}
          note="Target: above 75%"
          tone={stats.claimRate >= 0.75 ? 'good' : 'warn'}
        />
      </StatRow>

      <Section title="Overall split">
        <div className="panel">
          <SplitBar claimed={stats.collected} expired={stats.expired} height={40} />
        </div>
      </Section>

      <Section title="By month" lead="Offers posted each month, by how they were resolved.">
        <div className="panel">
          <BarChart
            data={months.map((m) => ({
              label: m.label,
              value: m.collected,
              valueSecondary: m.expired,
            }))}
            valueLabel="collected"
            secondaryLabel="expired"
            formatValue={(v) => formatNumber(v)}
          />
        </div>
      </Section>

      <Section title="By month, in detail">
        <div className="table-scroll">
          <table className="table">
            <caption className="sr-only">Offers posted, collected and expired, by month</caption>
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col" className="num">
                  Posted
                </th>
                <th scope="col" className="num">
                  Collected
                </th>
                <th scope="col" className="num">
                  Expired
                </th>
                <th scope="col" className="num">
                  Claim rate
                </th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => {
                const settled = m.collected + m.expired;
                const rate = settled === 0 ? null : m.collected / settled;
                return (
                  <tr key={m.key}>
                    <td>{m.label}</td>
                    <td className="num">{m.offersPosted}</td>
                    <td className="num">{m.collected}</td>
                    <td className="num">{m.expired}</td>
                    <td className="num">{rate === null ? '-' : formatPercent(rate)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}
