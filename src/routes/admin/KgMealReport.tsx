/* KG/MEALS REPORT: BY MONTH/DONOR/RECIPIENT, CONFIRMED HANDOVERS ONLY, 0.4KG/MEAL */

import { BarChart } from '../../components/charts/BarChart';
import { PageHead, Section } from '../../components/ui';
import { useAppState } from '../../store/context';
import { byDonor, byMonth, byRecipient } from '../../store/selectors';
import { formatNumber } from '../../lib/format';
import './Admin.css';

function RankTable({
  title,
  rows,
}: {
  title: string;
  rows: ReturnType<typeof byDonor>;
}) {
  const max = Math.max(1, ...rows.map((r) => r.kg));
  return (
    <Section title={title} count={rows.length}>
      <ul className="rank-list" aria-label={`${title}, ranked by kilograms moved`}>
        {rows.map((row) => (
          <li className="rank-row" key={row.organisationId}>
            <div className="rank-row__head">
              <span className="rank-row__label">
                <strong>{row.name}</strong>
                <span className="muted">
                  {row.suburb} · {formatNumber(row.count)} handovers
                </span>
              </span>
              <span className="rank-row__value">
                <span className="num">{formatNumber(row.kg)} kg</span>
                <span className="muted">{formatNumber(row.meals)} meals</span>
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

export function KgMealReport() {
  const state = useAppState();
  const months = byMonth(state, 6);
  const donors = byDonor(state);
  const recipients = byRecipient(state);

  return (
    <>
      <PageHead
        title="Kilograms and meal equivalents"
        lead="0.4 kg per meal, the sector-standard conversion, applied to confirmed handovers only."
      />

      <Section title="By month" count={months.length}>
        <div className="panel">
          <BarChart
            data={months.map((m) => ({ label: m.label, value: m.kg }))}
            valueLabel="kg"
          />
        </div>
      </Section>

      <RankTable title="By donor" rows={donors} />
      <RankTable title="By recipient" rows={recipients} />
    </>
  );
}
