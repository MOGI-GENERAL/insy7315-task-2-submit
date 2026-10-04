/* FUNDER REPORT EXPORT: REAL CSV VIA BLOB, SAME DATA AS OTHER REPORT SCREENS */

import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { PageHead, Section } from '../../components/ui';
import { useAppState } from '../../store/context';
import { byDonor, byMonth, byRecipient, headline } from '../../store/selectors';
import { formatNumber, formatPercent } from '../../lib/format';
import './Admin.css';

type ExportKind = 'monthly' | 'donor' | 'recipient';

function toCsv(rows: (string | number)[][]): string {
  const escape = (cell: string | number) => {
    const s = String(cell);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((row) => row.map(escape).join(',')).join('\r\n');
}

function download(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ExportReport() {
  const state = useAppState();
  const [kind, setKind] = useState<ExportKind>('monthly');
  const [downloaded, setDownloaded] = useState(false);

  const stats = headline(state);
  const months = byMonth(state, 12);
  const donors = byDonor(state);
  const recipients = byRecipient(state);

  const tables: Record<ExportKind, { title: string; header: string[]; rows: (string | number)[][] }> = {
    monthly: {
      title: 'Monthly summary',
      header: ['Month', 'Offers posted', 'Collected', 'Expired', 'Kg moved', 'Meal equivalents'],
      rows: months.map((m) => [m.label, m.offersPosted, m.collected, m.expired, Math.round(m.kg), m.meals]),
    },
    donor: {
      title: 'By donor',
      header: ['Donor', 'Suburb', 'Handovers', 'Kg moved', 'Meal equivalents'],
      rows: donors.map((d) => [d.name, d.suburb, d.count, Math.round(d.kg), d.meals]),
    },
    recipient: {
      title: 'By recipient',
      header: ['Recipient', 'Suburb', 'Handovers', 'Kg received', 'Meal equivalents'],
      rows: recipients.map((r) => [r.name, r.suburb, r.count, Math.round(r.kg), r.meals]),
    },
  };

  const active = tables[kind];
  const csv = toCsv([active.header, ...active.rows]);

  function handleDownload() {
    const date = new Date().toISOString().slice(0, 10);
    download(`fedsa-${kind}-report-${date}.csv`, csv);
    setDownloaded(true);
  }

  return (
    <>
      <PageHead
        title="Export a funder report"
        lead="A real CSV, built from the same handover records as the rest of the platform. Open it in a spreadsheet."
      />

      <Section title="Headline figures, for the report's covering summary">
        <div className="panel">
          <p>
            Since launch, FEDSA has moved <strong>{formatNumber(stats.totalKg)} kg</strong> of
            surplus food, equivalent to <strong>{formatNumber(stats.totalMeals)} meals</strong>,
            through <strong>{stats.collected}</strong> completed handovers across{' '}
            <strong>{stats.distinctRecipients}</strong> recipient organisations and{' '}
            <strong>{stats.activeDonors}</strong> donor businesses. {formatPercent(stats.claimRate)}{' '}
            of offers posted were claimed and collected rather than expiring unclaimed.
          </p>
        </div>
      </Section>

      <fieldset className="field">
        <legend className="field__label">What to export</legend>
        <div className="export-options choices">
          {(Object.keys(tables) as ExportKind[]).map((k) => (
            <label key={k} className="choice">
              <input
                type="radio"
                name="export-kind"
                checked={kind === k}
                onChange={() => {
                  setKind(k);
                  setDownloaded(false);
                }}
              />
              <span>{tables[k].title}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <h3>Preview</h3>
      <pre className="export-preview">{csv}</pre>

      <button type="button" className="btn btn--primary btn--lg" onClick={handleDownload}>
        <Icon name="download" size={20} />
        {downloaded ? 'Downloaded - export again' : `Download ${active.title}.csv`}
      </button>
    </>
  );
}
