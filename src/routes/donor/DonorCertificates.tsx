/* DONOR TAX CERTIFICATES — TRACEABLE TO HANDOVER RECORDS */

import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { EmptyState, PageHead, StatRow, StatTile } from '../../components/ui';
import { useAppState, useCurrentOrg } from '../../store/context';
import { certificatesForDonor } from '../../store/selectors';
import { useT, categoryKey } from '../../i18n/useT';
import {
  formatDateFull,
  formatKg,
  formatNumber,
  formatZar,
  mealsFromKg,
} from '../../lib/format';
import './Certificates.css';

export function DonorCertificates() {
  const state = useAppState();
  const org = useCurrentOrg()!;
  const t = useT();
  const [openId, setOpenId] = useState<string | null>(null);

  const all = certificatesForDonor(state, org.id);
  const issued = all.filter((c) => c.status === 'issued');
  const pending = all.filter((c) => c.status === 'pending');

  const totalKg = issued.reduce((sum, c) => sum + c.totalKg, 0);
  const totalValue = issued.reduce(
    (sum, c) => sum + c.valuationByCategory.reduce((s, v) => s + v.valueZar, 0),
    0,
  );

  return (
    <>
      <PageHead
        title={t('nav.certificates')}
        lead={`Issued to ${org.name} from the handover records both parties confirmed.`}
      />

      <StatRow>
        <StatTile
          icon="file"
          label="Certified this year"
          value={formatNumber(totalKg)}
          unit="kg"
          note={`${formatNumber(mealsFromKg(totalKg))} meal equivalents`}
          tone="good"
        />
        <StatTile
          icon="chart"
          label="Declared value"
          value={formatZar(totalValue)}
          note="Across all issued certificates"
        />
        <StatTile
          icon="clock"
          label="Awaiting issue"
          value={String(pending.length)}
          note="FEDSA issues at month end"
          tone={pending.length > 0 ? 'warn' : 'neutral'}
        />
      </StatRow>

      {all.length === 0 ? (
        <EmptyState
          icon="file"
          title="No certificates yet"
          body="A certificate is built once handovers have been confirmed by both sides."
        />
      ) : (
        <ul className="cert-list">
          {all.map((cert) => {
            const open = openId === cert.id;
            const value = cert.valuationByCategory.reduce((s, v) => s + v.valueZar, 0);
            return (
              <li key={cert.id} className="cert">
                <button
                  type="button"
                  className="cert__head"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : cert.id)}
                >
                  <span className="cert__icon">
                    <Icon name="file" size={22} />
                  </span>
                  <span className="cert__title">
                    <strong>{cert.reference}</strong>
                    <span className="muted">
                      {formatDateFull(cert.periodStart)} to {formatDateFull(cert.periodEnd)}
                    </span>
                  </span>
                  <span className="cert__figures">
                    <span className="num">{formatKg(cert.totalKg)}</span>
                    <span
                      className="badge"
                      data-tone={cert.status === 'issued' ? 'collected' : 'expiring'}
                    >
                      {cert.status === 'issued' ? 'Issued' : 'Pending'}
                    </span>
                  </span>
                  <Icon name={open ? 'back' : 'forward'} size={18} className="cert__chev" />
                </button>

                {open && (
                  <div className="cert__body">
                    <ul
                      className="valuation-list"
                      aria-label={`Valuation by food category for ${cert.reference}`}
                    >
                      {cert.valuationByCategory.map((line) => (
                        <li className="valuation-row" key={line.category}>
                          <span className="valuation-row__label">
                            <span className="valuation-row__cat">{t(categoryKey(line.category))}</span>
                            <span className="valuation-row__note">
                              {formatNumber(mealsFromKg(line.kg))} meals · {formatZar(line.valueZar)}
                            </span>
                          </span>
                          <span className="valuation-row__value num">{formatKg(line.kg)}</span>
                        </li>
                      ))}
                      <li className="valuation-row">
                        <span className="valuation-row__label">
                          <span className="valuation-row__cat">Total</span>
                          <span className="valuation-row__note">
                            {formatNumber(cert.mealEquivalents)} meals · {formatZar(value)}
                          </span>
                        </span>
                        <span className="valuation-row__value num">{formatKg(cert.totalKg)}</span>
                      </li>
                    </ul>

                    <p className="cert__trace">
                      <Icon name="shield" size={16} />
                      Built from {cert.handoverRecordIds.length} handover records, each confirmed by
                      your staff and by the receiving organisation.
                    </p>

                    {cert.status === 'issued' ? (
                      <button type="button" className="btn btn--secondary">
                        <Icon name="download" size={18} />
                        Download PDF
                      </button>
                    ) : (
                      <p className="muted cert__pending">
                        This period is still open. FEDSA issues certificates once the month closes.
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
