import { useState } from 'react';
import type { RecipientOrganisation, VerificationDecision } from '@fedsa/contract';
import { ConfirmDialog, Empty, errorKey, LoadState, useToast } from '../../components/feedback';
import { Icon } from '../../components/Icon';
import { VerificationBadge } from '../../components/StatusBadge';
import { Detail, DetailList, PageHead, Section } from '../../components/ui';
import { isApiError, useData, useLoad } from '../../data';
import { coldChainKey, useT } from '../../i18n/useT';
import { formatDateFull, formatKg } from '../../lib/format';
import { canClaim, distanceFromOffice, nextStatus, storageList } from '../../lib/org';
import './Coordinator.css';

const checks = [
  'verify.check1',
  'verify.check2',
  'verify.check3',
  'verify.check4',
  'verify.check5',
] as const;

const isRecipient = (org: { type: string }): org is RecipientOrganisation =>
  org.type === 'recipient';

/** the decisions the state machine allows from this status. reinstate lands on either target */
const allowed = (org: RecipientOrganisation) =>
  (['verify', 'reject', 'suspend', 'reinstate'] as const).filter(
    (decision) => nextStatus(org.status, decision, false) !== null,
  );

interface Pending {
  org: RecipientOrganisation;
  decision: VerificationDecision;
}

export function VerifyOrganisations() {
  const { organisations } = useData();
  const t = useT();
  const toast = useToast();
  const [pending, setPending] = useState<Pending | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const list = useLoad(async () => {
    const { items } = await organisations.list({ type: 'recipient' });
    return items.filter(isRecipient);
  }, [organisations]);

  function ask(org: RecipientOrganisation, decision: VerificationDecision) {
    setNote('');
    setPending({ org, decision });
  }

  async function decide() {
    if (!pending) return;
    setBusy(true);
    try {
      await organisations.decide(pending.org.id, {
        decision: pending.decision,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      toast.success(t(`verify.done.${pending.decision}`));
    } catch (error) {
      toast.error(t(errorKey(error)));
      // invalid state means another coordinator decided first. reload shows it
      if (!isApiError(error, 'INVALID_STATE')) return;
    } finally {
      setBusy(false);
      setPending(null);
    }
    await list.reload();
  }

  return (
    <>
      <PageHead title={t('verify.title')} lead={t('verify.lead')} />

      <LoadState result={list}>
        {(all) => {
          const awaiting = all.filter((org) => org.status === 'pending');
          const rejected = all.filter((org) => org.status === 'rejected');
          const verified = all.filter(canClaim);
          const suspended = all.filter((org) => org.status === 'suspended');

          return (
            <>
              <Section title={t('verify.awaitingTitle')} count={awaiting.length}>
                {awaiting.length === 0 ? (
                  <Empty
                    icon="check-circle"
                    title={t('verify.noneTitle')}
                    body={t('verify.noneBody')}
                  />
                ) : (
                  awaiting.map((org) => <VerifyCard key={org.id} org={org} onDecide={ask} />)
                )}
              </Section>

              {rejected.length > 0 && (
                <Section title={t('verify.rejectedTitle')} count={rejected.length}>
                  {rejected.map((org) => (
                    <VerifyCard key={org.id} org={org} onDecide={ask} />
                  ))}
                </Section>
              )}

              <Section title={t('verify.verifiedTitle')} count={verified.length}>
                <OrgRows orgs={verified} label={t('verify.verifiedTitle')} onDecide={ask} />
              </Section>

              {suspended.length > 0 && (
                <Section title={t('verify.suspendedTitle')} count={suspended.length}>
                  <OrgRows orgs={suspended} label={t('verify.suspendedTitle')} onDecide={ask} />
                </Section>
              )}
            </>
          );
        }}
      </LoadState>

      <ConfirmDialog
        open={pending !== null}
        title={t(`verify.confirm.${pending?.decision ?? 'verify'}`).replace(
          '{name}',
          pending?.org.name ?? '',
        )}
        confirmLabel={t(`verify.action.${pending?.decision ?? 'verify'}`)}
        tone={pending?.decision === 'verify' || pending?.decision === 'reinstate' ? 'go' : 'danger'}
        busy={busy}
        onConfirm={() => void decide()}
        onCancel={() => setPending(null)}
      >
        <p>{t(`verify.why.${pending?.decision ?? 'verify'}`)}</p>
        <div className="field">
          <label className="field__label" htmlFor="verify-note">
            {t('verify.noteLabel')}
          </label>
          <textarea
            id="verify-note"
            className="textarea"
            rows={3}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </ConfirmDialog>
    </>
  );
}

function storageText(org: RecipientOrganisation, t: ReturnType<typeof useT>) {
  return storageList(org)
    .map((s) => t(coldChainKey(s)))
    .join(', ');
}

function DecisionButtons({
  org,
  disabled,
  onDecide,
}: {
  org: RecipientOrganisation;
  disabled?: boolean;
  onDecide: (org: RecipientOrganisation, decision: VerificationDecision) => void;
}) {
  const t = useT();
  return (
    <>
      {allowed(org).map((decision) => {
        const approving = decision === 'verify' || decision === 'reinstate';
        return (
          <button
            key={decision}
            type="button"
            className={approving ? 'btn btn--go' : 'btn btn--secondary'}
            disabled={approving && disabled}
            onClick={() => onDecide(org, decision)}
          >
            <Icon name={approving ? 'check' : 'close'} size={18} />
            {t(`verify.action.${decision}`)}
          </button>
        );
      })}
    </>
  );
}

function VerifyCard({
  org,
  onDecide,
}: {
  org: RecipientOrganisation;
  onDecide: (org: RecipientOrganisation, decision: VerificationDecision) => void;
}) {
  const t = useT();
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const allTicked = ticked.size === checks.length;

  return (
    <div className="verify-card">
      <div className="row row--between row--wrap">
        <div>
          <h3>{org.name}</h3>
          <p className="muted">
            {org.suburb} · {distanceFromOffice(org)} km ·{' '}
            {t('verify.registered').replace('{date}', formatDateFull(org.createdAt))}
          </p>
        </div>
        <VerificationBadge status={org.status} />
      </div>

      <DetailList>
        <Detail label={t('verify.contact')}>
          {org.contactName}
          <div className="muted">{org.contactPhone}</div>
        </Detail>
        <Detail label={t('verify.capacity')}>
          {org.maxCapacityKg === null ? t('verify.noLimit') : formatKg(org.maxCapacityKg)}
        </Detail>
        <Detail label={t('verify.storage')}>{storageText(org, t)}</Detail>
        <Detail label={t('verify.transport')}>
          {org.hasTransport ? t('verify.ownVehicle') : t('verify.needsDriver')}
        </Detail>
        <Detail label={t('verify.mealsPerDay')}>{org.mealsPerDay ?? '-'}</Detail>
      </DetailList>

      <hr className="divider" style={{ margin: 'var(--s-4) 0' }} />

      <h4>{t('verify.checklistTitle')}</h4>
      <ul className="checklist">
        {checks.map((check) => (
          <li key={check}>
            <label>
              <input
                type="checkbox"
                checked={ticked.has(check)}
                onChange={() =>
                  setTicked((current) => {
                    const next = new Set(current);
                    if (!next.delete(check)) next.add(check);
                    return next;
                  })
                }
              />
              <span>{t(check)}</span>
            </label>
          </li>
        ))}
      </ul>

      <div className="row row--wrap" style={{ gap: 'var(--s-3)' }}>
        <DecisionButtons org={org} disabled={!allTicked} onDecide={onDecide} />
      </div>
      {!allTicked && (
        <p className="field__hint" style={{ marginTop: 'var(--s-2)' }}>
          {t('verify.checklistHint')}
        </p>
      )}
    </div>
  );
}

function OrgRows({
  orgs,
  label,
  onDecide,
}: {
  orgs: RecipientOrganisation[];
  label: string;
  onDecide: (org: RecipientOrganisation, decision: VerificationDecision) => void;
}) {
  const t = useT();
  return (
    <ul className="verify-list" aria-label={label}>
      {orgs.map((org) => (
        <li className="verify-row" key={org.id}>
          <div className="verify-row__top">
            <span className="verify-row__label">
              <strong>{org.name}</strong>
              <span className="muted">{org.suburb}</span>
            </span>
            <span className="verify-row__value">
              <span className="num">
                {org.maxCapacityKg === null ? t('verify.noLimit') : formatKg(org.maxCapacityKg)}
              </span>
              <span className="muted">{t('verify.capacity')}</span>
            </span>
          </div>
          <div className="verify-row__meta">
            <span className="muted">
              {storageText(org, t)} ·{' '}
              {org.hasTransport ? t('verify.ownVehicle') : t('verify.needsDriver')}
            </span>
            <span className="row" style={{ gap: 'var(--s-2)' }}>
              <DecisionButtons org={org} onDecide={onDecide} />
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
