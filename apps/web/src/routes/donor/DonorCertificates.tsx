import { useState } from 'react';
import type { TaxCertificate } from '@fedsa/contract';
import { useSession } from '../../auth/context';
import { dataMode, useData, useLoad } from '../../data';
import { Empty, LoadState } from '../../components/feedback';
import { Icon } from '../../components/Icon';
import { PageHead } from '../../components/ui';
import { fill } from '../../i18n/useFormat';
import { useT, categoryKey } from '../../i18n/useT';
import { formatDateFull, formatKg, formatNumber, formatZar, mealsFromKg } from '../../lib/format';
import './Certificates.css';

export function DonorCertificates() {
  const { organisation } = useSession();
  const { certificates } = useData();
  const t = useT();
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useLoad(() => certificates.list({}), [certificates]);

  return (
    <>
      <PageHead
        title={t('nav.certificates')}
        lead={organisation ? fill(t('dcert.lead'), { name: organisation.name }) : undefined}
      />

      <LoadState
        result={list}
        isEmpty={(d) => d.items.length === 0}
        empty={<Empty icon="file" title={t('acert.none')} body={t('dcert.noneBody')} />}
      >
        {({ items }) => (
          <ul className="cert-list">
            {items.map((cert) => (
              <CertificateRow
                key={cert.id}
                cert={cert}
                open={openId === cert.id}
                onToggle={() => setOpenId(openId === cert.id ? null : cert.id)}
              />
            ))}
          </ul>
        )}
      </LoadState>
    </>
  );
}

function CertificateRow({
  cert,
  open,
  onToggle,
}: {
  cert: TaxCertificate;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useT();

  return (
    <li className="cert">
      <button type="button" className="cert__head" aria-expanded={open} onClick={onToggle}>
        <span className="cert__icon">
          <Icon name="file" size={22} />
        </span>
        <span className="cert__title">
          <strong>{cert.certificateNumber}</strong>
          <span className="muted">
            {fill(t('acert.period'), {
              from: formatDateFull(cert.periodStart),
              to: formatDateFull(cert.periodEnd),
            })}
          </span>
        </span>
        <span className="cert__figures">
          <span className="num">{formatKg(cert.totalQuantityKg)}</span>
          <span className="num">{formatZar(cert.totalValue)}</span>
        </span>
        <Icon name={open ? 'back' : 'forward'} size={18} className="cert__chev" />
      </button>

      {open && (
        <div className="cert__body">
          <ul
            className="valuation-list"
            aria-label={`${t('acert.breakdown')}, ${cert.certificateNumber}`}
          >
            {cert.valuationByCategory.map((line) => (
              <li className="valuation-row" key={line.category}>
                <span className="valuation-row__label">
                  <span className="valuation-row__cat">{t(categoryKey(line.category))}</span>
                  <span className="valuation-row__note">
                    {formatZar(line.ratePerKg)} / {t('common.kg')} · {formatZar(line.value)}
                  </span>
                </span>
                <span className="valuation-row__value num">{formatKg(line.quantityKg)}</span>
              </li>
            ))}
            <li className="valuation-row">
              <span className="valuation-row__label">
                <span className="valuation-row__cat">{t('acert.total')}</span>
                <span className="valuation-row__note">
                  {fill(t('acert.meals'), {
                    count: formatNumber(mealsFromKg(cert.totalQuantityKg)),
                  })}{' '}
                  · {formatZar(cert.totalValue)}
                </span>
              </span>
              <span className="valuation-row__value num">{formatKg(cert.totalQuantityKg)}</span>
            </li>
          </ul>

          <p className="cert__trace">
            <Icon name="shield" size={16} />
            {fill(t('acert.issuedOn'), { date: formatDateFull(cert.issuedAt) })}.{' '}
            {fill(t('acert.handovers'), { count: cert.handoverRecordIds.length })}
          </p>

          {dataMode() === 'fake' ? (
            <p className="muted cert__pending">{t('acert.pdfFake')}</p>
          ) : (
            <a
              className="btn btn--secondary"
              href={`/api/tax-certificates/${cert.id}/pdf`}
              target="_blank"
              rel="noopener"
            >
              <Icon name="download" size={18} />
              {t('acert.pdf')}
            </a>
          )}
        </div>
      )}
    </li>
  );
}
