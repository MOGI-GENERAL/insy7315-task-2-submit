import { useState } from 'react';
import {
  FoodCategory,
  IssueCertificateRequest,
  UpdateValuationRatesRequest,
} from '@fedsa/contract';
import type { Organisation, TaxCertificate, ValuationRate } from '@fedsa/contract';
import { ConfirmDialog, Empty, errorKey, LoadState, useToast } from '../../components/feedback';
import { Field, FormError, useForm } from '../../components/forms';
import type { Validator } from '../../components/forms';
import { Icon } from '../../components/Icon';
import { Banner, PageHead, Section } from '../../components/ui';
import { dataMode, isApiError, useData, useLoad } from '../../data';
import { fill } from '../../i18n/useFormat';
import { categoryKey, useT } from '../../i18n/useT';
import { formatDateFull, formatKg, formatNumber, formatZar, mealsFromKg } from '../../lib/format';
import { ReportTable } from './ReportTable';
import './Admin.css';

const saDay = (date: Date) => date.toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' });

/** a period ends at 23:59 in South African time, which is the next day anywhere further east */
const saDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Johannesburg',
  });

/** the previous calendar month, which is the period a monthly certificate covers */
function lastMonth() {
  const now = new Date();
  return {
    periodStart: saDay(new Date(now.getFullYear(), now.getMonth() - 1, 1, 12)),
    periodEnd: saDay(new Date(now.getFullYear(), now.getMonth(), 0, 12)),
  };
}

/** the rates form is keyed by category, the request is a list */
const ratesRequest: Validator<UpdateValuationRatesRequest> = {
  safeParse: (values) => {
    const rates = (values as { rates: Record<string, number | undefined> }).rates;
    const parsed = UpdateValuationRatesRequest.safeParse({
      items: FoodCategory.options.map((category) => ({ category, ratePerKg: rates[category] })),
    });
    if (parsed.success) return parsed;
    return {
      success: false,
      error: {
        issues: parsed.error.issues.map((issue) => {
          const index = issue.path[1];
          return issue.path[0] === 'items' && typeof index === 'number'
            ? { ...issue, path: ['rates', FoodCategory.options[index]] }
            : issue;
        }),
      },
    };
  },
};

function IssueForm({
  donors,
  onIssued,
}: {
  donors: Organisation[];
  onIssued: () => Promise<void>;
}) {
  const { certificates } = useData();
  const t = useT();
  const toast = useToast();
  const [pending, setPending] = useState<IssueCertificateRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [nothing, setNothing] = useState(false);

  const form = useForm({
    initial: { donorOrganisationId: '', ...lastMonth() },
    schema: IssueCertificateRequest,
    onSubmit: (body) => {
      setNothing(false);
      setPending(body);
    },
  });

  async function issue() {
    if (!pending) return;
    setBusy(true);
    try {
      const { certificate } = await certificates.issue(pending);
      toast.success(fill(t('acert.issued'), { number: certificate.certificateNumber }));
      setNothing(false);
    } catch (error) {
      if (isApiError(error, 'INVALID_STATE')) setNothing(true);
      else toast.error(t(errorKey(error)));
    } finally {
      setBusy(false);
      setPending(null);
    }
    await onIssued();
  }

  const donor = donors.find((org) => org.id === pending?.donorOrganisationId);

  return (
    <>
      <form {...form.formProps} className="stack panel">
        <FormError form={form} />
        {nothing && <Banner tone="warn">{t('acert.nothingToIssue')}</Banner>}
        <Field form={form} name="donorOrganisationId" label={t('acert.donor')}>
          {(props) => (
            <select {...props} className="select">
              <option value="">{t('acert.chooseDonor')}</option>
              {donors.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <div className="range-picker__inputs">
          <Field form={form} name="periodStart" label={t('acert.periodStart')}>
            {(props) => <input {...props} className="input" type="date" />}
          </Field>
          <Field form={form} name="periodEnd" label={t('acert.periodEnd')}>
            {(props) => <input {...props} className="input" type="date" />}
          </Field>
        </div>
        <p className="muted">{t('acert.periodHint')}</p>
        <button type="submit" className="btn btn--primary">
          <Icon name="check" size={18} />
          {t('acert.issue')}
        </button>
      </form>

      <ConfirmDialog
        open={pending !== null}
        title={fill(t('acert.confirmTitle'), { name: donor?.name ?? '' })}
        confirmLabel={t('acert.issue')}
        tone="go"
        busy={busy}
        onConfirm={() => void issue()}
        onCancel={() => setPending(null)}
      >
        <p>{t('acert.confirmBody')}</p>
      </ConfirmDialog>
    </>
  );
}

function RatesForm({ rates, onSaved }: { rates: ValuationRate[]; onSaved: () => Promise<void> }) {
  const { certificates } = useData();
  const t = useT();
  const toast = useToast();
  const [pending, setPending] = useState<UpdateValuationRatesRequest | null>(null);
  const [busy, setBusy] = useState(false);

  const byCategory = new Map(rates.map((rate) => [rate.category, rate]));
  const form = useForm({
    initial: {
      rates: Object.fromEntries(
        FoodCategory.options.map((category) => [category, byCategory.get(category)?.ratePerKg]),
      ),
    },
    schema: ratesRequest,
    onSubmit: (body) => setPending(body),
  });

  async function save() {
    if (!pending) return;
    setBusy(true);
    try {
      await certificates.updateRates(pending);
      toast.success(t('acert.ratesSaved'));
    } catch (error) {
      toast.error(t(errorKey(error)));
    } finally {
      setBusy(false);
      setPending(null);
    }
    await onSaved();
  }

  return (
    <>
      <form {...form.formProps} className="stack panel">
        <FormError form={form} />
        {FoodCategory.options.map((category) => {
          const rate = byCategory.get(category);
          return (
            <Field
              key={category}
              form={form}
              kind="number"
              name={`rates.${category}`}
              label={t(categoryKey(category))}
              hint={
                !rate || rate.updatedByUserId === null
                  ? t('acert.ratesPlaceholder')
                  : fill(t('acert.ratesUpdated'), { date: formatDateFull(rate.updatedAt) })
              }
            >
              {(props) => (
                <input
                  {...props}
                  className="input"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                />
              )}
            </Field>
          );
        })}
        <button type="submit" className="btn btn--primary">
          {t('acert.ratesSave')}
        </button>
      </form>

      <ConfirmDialog
        open={pending !== null}
        title={t('acert.ratesConfirmTitle')}
        confirmLabel={t('acert.ratesSave')}
        busy={busy}
        onConfirm={() => void save()}
        onCancel={() => setPending(null)}
      >
        <p>{t('acert.ratesConfirmBody')}</p>
      </ConfirmDialog>
    </>
  );
}

function CertificateCard({ cert, donor }: { cert: TaxCertificate; donor: string }) {
  const t = useT();
  return (
    <li className="rank-row">
      <div className="rank-row__head">
        <span className="rank-row__label">
          <strong>{cert.certificateNumber}</strong>
          <span className="muted">
            {donor} ·{' '}
            {fill(t('acert.period'), {
              from: saDate(cert.periodStart),
              to: saDate(cert.periodEnd),
            })}
          </span>
          <span className="muted">
            {fill(t('acert.issuedOn'), { date: formatDateFull(cert.issuedAt) })} ·{' '}
            {fill(t('acert.handovers'), { count: cert.handoverRecordIds.length })}
          </span>
        </span>
        <span className="rank-row__value">
          <span className="num">{formatKg(cert.totalQuantityKg)}</span>
          <span className="muted">
            {fill(t('acert.meals'), { count: formatNumber(mealsFromKg(cert.totalQuantityKg)) })} ·{' '}
            {formatZar(cert.totalValue)}
          </span>
        </span>
      </div>
      <details>
        <summary>{t('acert.breakdown')}</summary>
        <ReportTable
          caption={`${t('acert.breakdown')}: ${cert.certificateNumber}`}
          head={[t('acert.colCategory'), t('acert.colKg'), t('acert.colRate'), t('acert.colValue')]}
          rows={cert.valuationByCategory.map((line) => [
            t(categoryKey(line.category)),
            formatKg(line.quantityKg),
            formatZar(line.ratePerKg),
            formatZar(line.value),
          ])}
          foot={[t('acert.total'), formatKg(cert.totalQuantityKg), '', formatZar(cert.totalValue)]}
        />
      </details>
      {dataMode() === 'fake' ? (
        <p className="muted">{t('acert.pdfFake')}</p>
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
    </li>
  );
}

export function AdminCertificates() {
  const { certificates, organisations } = useData();
  const t = useT();

  const page = useLoad(async () => {
    const [issued, donors, rates] = await Promise.all([
      certificates.list({}),
      organisations.list({ type: 'donor' }),
      certificates.rates(),
    ]);
    return { issued: issued.items, donors: donors.items, rates: rates.items };
  }, [certificates, organisations]);

  return (
    <>
      <PageHead title={t('acert.title')} lead={t('acert.lead')} />

      <LoadState result={page}>
        {({ issued, donors, rates }) => {
          const donorName = new Map(donors.map((org) => [org.id, org.name]));
          const newestFirst = [...issued].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
          return (
            <>
              <Section title={t('acert.issueTitle')}>
                <IssueForm donors={donors} onIssued={page.reload} />
              </Section>

              <Section title={t('acert.issuedTitle')} count={issued.length}>
                {issued.length === 0 ? (
                  <Empty icon="shield" title={t('acert.none')} body={t('acert.noneBody')} />
                ) : (
                  <ul className="rank-list" aria-label={t('acert.issuedTitle')}>
                    {newestFirst.map((cert) => (
                      <CertificateCard
                        key={cert.id}
                        cert={cert}
                        donor={donorName.get(cert.donorOrganisationId) ?? ''}
                      />
                    ))}
                  </ul>
                )}
              </Section>

              <Section title={t('acert.ratesTitle')} lead={t('acert.ratesLead')}>
                <RatesForm rates={rates} onSaved={page.reload} />
              </Section>
            </>
          );
        }}
      </LoadState>
    </>
  );
}
