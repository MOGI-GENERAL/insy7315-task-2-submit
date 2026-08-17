/* ADMIN REPORTS HOME: HEADLINE STATS + LINKS INTO DETAILED REPORTS */

import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { PageHead, Section, StatRow, StatTile } from '../../components/ui';
import { SplitBar } from '../../components/charts/SplitBar';
import { useAppState } from '../../store/context';
import { byMonth, headline } from '../../store/selectors';
import { formatNumber, formatPercent } from '../../lib/format';
import './Admin.css';

export function ReportsHome() {
  const state = useAppState();
  const stats = headline(state);
  const months = byMonth(state, 3);

  return (
    <>
      <PageHead
        title="Reports"
        lead="Every figure below is drawn from handover records both parties confirmed, not from an estimate."
      />

      <StatRow>
        <StatTile
          icon="scale"
          label="Moved this month"
          value={formatNumber(stats.thisMonthKg)}
          unit="kg"
          note={`${formatNumber(stats.thisMonthMeals)} meal equivalents`}
          tone="good"
        />
        <StatTile
          icon="chart"
          label="Claimed vs expired"
          value={formatPercent(stats.claimRate)}
          note="Target is above 75%"
          tone={stats.claimRate >= 0.75 ? 'good' : 'warn'}
        />
        <StatTile
          icon="people"
          label="Recipient organisations served"
          value={String(stats.distinctRecipients)}
          note={`${stats.activeDonors} active donors`}
        />
        <StatTile
          icon="clock"
          label="Median time to claim"
          value={stats.medianMinutesToClaim === null ? '-' : String(stats.medianMinutesToClaim)}
          unit="min"
          note="Target is under 20"
          tone={
            stats.medianMinutesToClaim !== null && stats.medianMinutesToClaim <= 20
              ? 'good'
              : 'warn'
          }
        />
      </StatRow>

      <Section
        title="Claimed vs expired, all time"
        lead="The funder's own measure of whether matching is working."
        actions={
          <Link to="/admin/claimed-expired" className="btn btn--ghost">
            Full breakdown
          </Link>
        }
      >
        <div className="panel">
          <SplitBar claimed={stats.collected} expired={stats.expired} />
        </div>
      </Section>

      <Section
        title="Recent months"
        lead="Kilograms moved, from confirmed handovers only."
        actions={
          <Link to="/admin/kg-meals" className="btn btn--ghost">
            Full report
          </Link>
        }
      >
        <StatRow>
          {months.map((m) => (
            <StatTile
              key={m.key}
              icon="clock"
              label={m.label}
              value={formatNumber(m.kg)}
              unit="kg"
              note={`${formatNumber(m.meals)} meals`}
            />
          ))}
        </StatRow>
      </Section>

      <Section title="Where to go next">
        <div className="admin-nav-grid">
          <Link to="/admin/kg-meals" className="admin-nav-card">
            <Icon name="chart" size={24} />
            <span>Kg and meals by donor and recipient</span>
          </Link>
          <Link to="/admin/claimed-expired" className="admin-nav-card">
            <Icon name="scale" size={24} />
            <span>Claimed vs expired detail</span>
          </Link>
          <Link to="/admin/export" className="admin-nav-card">
            <Icon name="download" size={24} />
            <span>Export a funder-ready report</span>
          </Link>
          <Link to="/admin/certificates" className="admin-nav-card">
            <Icon name="file" size={24} />
            <span>Tax certificates</span>
          </Link>
        </div>
      </Section>
    </>
  );
}
