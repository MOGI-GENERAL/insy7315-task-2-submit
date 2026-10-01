/* TAX CERTIFICATES: AUTO-PREPARED, MANUALLY ISSUED (REVIEW GATE BEFORE RELEASE) */

import { Icon } from '../../components/Icon';
import { EventBanner } from '../../components/EventBanner';
import { PageHead, Section } from '../../components/ui';
import { useApp, useCurrentUser } from '../../store/context';
import { orgById } from '../../store/selectors';
import { useT, categoryKey } from '../../i18n/useT';
import { formatDateFull, formatKg, formatNumber, formatZar, mealsFromKg } from '../../lib/format';
import '../donor/Certificates.css';
import './Admin.css';

export function AdminCertificates() {
  const { state, dispatch } = useApp();
  const user = useCurrentUser()!;
  const t = useT();

  const pending = state.certificates.filter((c) => c.status === 'pending');
  const issued = state.certificates.filter((c) => c.status === 'issued');

  return (
    <>
      <PageHead
        title="Tax certificates"
        lead="Built automatically from confirmed handovers. Nothing reaches a donor until you review and issue it."
      />

      <EventBanner />

      <Section title="Ready to issue" count={pending.length}>
        {pending.length === 0 ? (
          <p className="muted">Nothing waiting. Certificates are prepared once a month closes.</p>
        ) : (
          <ul className="cert-list">
            {pending.map((cert) => {
              const org = orgById(state, cert.donorOrganisationId);
              const value = cert.valuationByCategory.reduce((s, v) => s + v.valueZar, 0);
              return (
                <li key={cert.id} className="cert">
                  <div className="cert__body" style={{ paddingTop: 'var(--s-4)' }}>
                    <div className="row row--between row--wrap">
                      <div>
                        <strong style={{ fontFamily: 'var(--font-head)', fontSize: 'var(--t-lg)' }}>
                          {cert.reference}
                        </strong>
                        <p className="muted">
                          {org?.name} · {formatDateFull(cert.periodStart)} to{' '}
                          {formatDateFull(cert.periodEnd)}
                        </p>
                      </div>
                      <span className="badge" data-tone="expiring">
                        Pending
                      </span>
                    </div>

                    <ul
                      className="valuation-list"
                      aria-label={`Valuation breakdown for ${cert.reference}`}
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
                      Traceable to {cert.handoverRecordIds.length} handover records, each confirmed
                      by both parties.
                    </p>

                    <button
                      type="button"
                      className="btn btn--go"
                      onClick={() =>
                        dispatch({
                          type: 'ISSUE_CERTIFICATE',
                          certificateId: cert.id,
                          userId: user.id,
                        })
                      }
                    >
                      <Icon name="check" size={18} />
                      Issue to {org?.name}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Issued" count={issued.length}>
        <ul className="rank-list" aria-label="Certificates already issued to donors">
          {issued.map((cert) => {
            const org = orgById(state, cert.donorOrganisationId);
            return (
              <li className="rank-row" key={cert.id}>
                <div className="rank-row__head">
                  <span className="rank-row__label">
                    <strong>{cert.reference}</strong>
                    <span className="muted">
                      {org?.name} · {formatDateFull(cert.periodStart)} – {formatDateFull(cert.periodEnd)}
                    </span>
                    <span className="muted">
                      Issued {cert.issuedAt && formatDateFull(cert.issuedAt)}
                    </span>
                  </span>
                  <span className="rank-row__value">
                    <span className="num">{formatNumber(cert.totalKg)} kg</span>
                    <span className="muted">{formatNumber(cert.mealEquivalents)} meals</span>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </Section>
    </>
  );
}
