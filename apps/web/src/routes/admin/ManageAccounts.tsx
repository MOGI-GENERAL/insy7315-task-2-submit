import { useEffect, useRef, useState } from 'react';
import { AuditAction, CreateUserRequest, Language, Role, SCHEDULER_EMAIL } from '@fedsa/contract';
import type { Organisation, Role as RoleName, User } from '@fedsa/contract';
import { Field, FormError, useForm } from '../../components/forms';
import type { Validator } from '../../components/forms';
import {
  ConfirmDialog,
  Empty,
  errorKey,
  LoadState,
  PendingButton,
  useToast,
} from '../../components/feedback';
import { Banner, PageHead, Section, StatRow, StatTile } from '../../components/ui';
import { useSession } from '../../auth/context';
import { useData, useLoad } from '../../data';
import { fill } from '../../i18n/useFormat';
import { languageNames } from '../../i18n/strings';
import { useT } from '../../i18n/useT';
import { formatDateTime } from '../../lib/format';
import './Admin.css';

const STAFF: RoleName[] = ['coordinator', 'administrator'];
const AUDIT_SHOWN = 50;

type Change =
  | { kind: 'status'; user: User; status: 'active' | 'disabled' }
  | { kind: 'role'; user: User; role: RoleName }
  | { kind: 'reset'; user: User };

/** a temporary password to hand over, from a new account or a reset */
interface TempPassword {
  kind: 'created' | 'reset';
  name: string;
  tempPassword: string;
}

/** an empty organisation box means none, which only staff accounts may have */
const createAccount: Validator<CreateUserRequest> = {
  safeParse: (values) => {
    const v = values as Record<string, unknown>;
    return CreateUserRequest.safeParse({ ...v, organisationId: v.organisationId || undefined });
  },
};

function CreateAccount({
  organisations,
  onCreated,
}: {
  organisations: Organisation[];
  onCreated: (name: string, tempPassword: string) => Promise<void>;
}) {
  const { users } = useData();
  const t = useT();
  const toast = useToast();

  const form = useForm({
    initial: {
      fullName: '',
      email: '',
      role: 'coordinator',
      organisationId: '',
      phone: '',
      languagePreference: 'en',
    },
    schema: createAccount,
    onSubmit: async (body) => {
      const { user, tempPassword } = await users.create(body);
      form.reset();
      toast.success(t('acct.createdDone'));
      await onCreated(user.fullName, tempPassword);
    },
  });

  const role = form.values.role;
  const belongsToOrganisation = role === 'donor' || role === 'recipient';

  return (
    <form {...form.formProps} className="stack panel">
      <FormError form={form} />
      <Field form={form} name="fullName" label={t('acct.fullName')}>
        {(props) => <input {...props} className="input" autoComplete="off" />}
      </Field>
      <Field form={form} name="email" label={t('acct.email')}>
        {(props) => <input {...props} className="input" type="email" autoComplete="off" />}
      </Field>
      <Field form={form} name="role" label={t('acct.role')}>
        {(props) => (
          <select
            {...props}
            className="select"
            onChange={(e) => {
              props.onChange(e);
              form.set('organisationId', '');
            }}
          >
            {Role.options.map((option) => (
              <option key={option} value={option}>
                {t(`role.${option}`)}
              </option>
            ))}
          </select>
        )}
      </Field>
      {belongsToOrganisation && (
        <Field
          form={form}
          name="organisationId"
          label={t('acct.organisation')}
          hint={t('acct.organisationHint')}
        >
          {(props) => (
            <select {...props} className="select">
              <option value="">{t('acct.chooseOrganisation')}</option>
              {organisations
                .filter((org) => org.type === role)
                .map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
            </select>
          )}
        </Field>
      )}
      <Field form={form} name="phone" label={t('acct.phone')} hint={t('acct.phoneHint')}>
        {(props) => <input {...props} className="input" type="tel" autoComplete="off" />}
      </Field>
      <Field form={form} name="languagePreference" label={t('acct.language')}>
        {(props) => (
          <select {...props} className="select">
            {Language.options.map((option) => (
              <option key={option} value={option}>
                {languageNames[option]}
              </option>
            ))}
          </select>
        )}
      </Field>
      <PendingButton type="submit" className="btn btn--primary" pending={form.pending}>
        {t('acct.create')}
      </PendingButton>
    </form>
  );
}

export function ManageAccounts() {
  const { users, organisations } = useData();
  const { user: me } = useSession();
  const t = useT();
  const toast = useToast();
  const [change, setChange] = useState<Change | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<TempPassword | null>(null);
  const tempRef = useRef<HTMLDivElement>(null);
  const [auditFilter, setAuditFilter] = useState<AuditAction | ''>('');

  const accounts = useLoad(async () => {
    const [people, orgs] = await Promise.all([users.list({}), organisations.list({})]);
    return { users: people.items, organisations: orgs.items };
  }, [users, organisations]);
  const audit = useLoad(
    () => users.auditLog(auditFilter ? { action: auditFilter } : {}),
    [users, auditFilter],
  );

  // the banner is at the top, far from the button that produced it
  useEffect(() => {
    if (created) tempRef.current?.focus();
  }, [created]);

  async function apply() {
    if (!change) return;
    setBusy(true);
    try {
      if (change.kind === 'reset') {
        const { tempPassword } = await users.resetPassword(change.user.id);
        toast.success(t('acct.resetDone'));
        setCreated({ kind: 'reset', name: change.user.fullName, tempPassword });
        return;
      }
      await users.update(
        change.user.id,
        change.kind === 'status' ? { status: change.status } : { role: change.role },
      );
      toast.success(
        t(
          change.kind === 'role'
            ? 'acct.roleDone'
            : change.status === 'disabled'
              ? 'acct.disabledDone'
              : 'acct.enabledDone',
        ),
      );
    } catch (error) {
      toast.error(t(errorKey(error)));
    } finally {
      setBusy(false);
      setChange(null);
      await Promise.all([accounts.reload(), audit.reload()]);
    }
  }

  const confirm = change && {
    name: change.user.fullName,
    title:
      change.kind === 'reset'
        ? t('acct.confirmReset')
        : change.kind === 'role'
          ? t('acct.confirmRole')
          : change.status === 'disabled'
            ? t('acct.confirmDisable')
            : t('acct.confirmEnable'),
    why:
      change.kind === 'reset'
        ? t('acct.whyReset')
        : change.kind === 'role'
          ? t('acct.whyRole')
          : change.status === 'disabled'
            ? t('acct.whyDisable')
            : t('acct.whyEnable'),
    label:
      change.kind === 'reset'
        ? t('acct.resetPassword')
        : change.kind === 'role'
          ? t(change.role === 'administrator' ? 'acct.makeAdministrator' : 'acct.makeCoordinator')
          : change.status === 'disabled'
            ? t('acct.disable')
            : t('acct.enable'),
  };

  return (
    <>
      <PageHead title={t('acct.title')} lead={t('acct.lead')} />

      {created && (
        <div ref={tempRef} tabIndex={-1}>
          <Banner
            tone="warn"
            title={fill(t(created.kind === 'reset' ? 'acct.resetTitle' : 'acct.tempTitle'), {
              name: created.name,
            })}
          >
            <p>{fill(t('acct.tempBody'), { name: created.name })}</p>
            <p>
              <span className="muted">{t('acct.tempLabel')}</span>{' '}
              <code className="temp-password">{created.tempPassword}</code>
            </p>
            <button type="button" className="btn btn--secondary" onClick={() => setCreated(null)}>
              {t('acct.tempDismiss')}
            </button>
          </Banner>
        </div>
      )}

      <LoadState result={accounts}>
        {({ users: people, organisations: orgs }) => {
          const orgName = new Map(orgs.map((org) => [org.id, org.name]));
          const sorted = [...people].sort((a, b) => a.fullName.localeCompare(b.fullName));
          const activeCount = people.filter((u) => u.status === 'active').length;

          return (
            <>
              <StatRow>
                <StatTile
                  icon="check-circle"
                  label={t('acct.active')}
                  value={String(activeCount)}
                  tone="good"
                />
                <StatTile
                  icon="alert"
                  label={t('acct.disabled')}
                  value={String(people.length - activeCount)}
                  tone="neutral"
                />
                <StatTile icon="people" label={t('acct.total')} value={String(people.length)} />
              </StatRow>

              <Section title={t('acct.allTitle')} count={people.length}>
                <ul className="account-list" aria-label={t('acct.allTitle')}>
                  {sorted.map((u) => {
                    const own = u.id === me.id;
                    const staff = STAFF.includes(u.role);
                    const otherRole = u.role === 'administrator' ? 'coordinator' : 'administrator';
                    return (
                      <li
                        className="account-card"
                        key={u.id}
                        data-disabled={u.status === 'disabled'}
                      >
                        <div className="account-card__top">
                          <span className="account-card__who">
                            <strong>
                              {u.fullName}
                              {own && <span className="muted"> ({t('acct.you')})</span>}
                            </strong>
                            <span className="muted">{u.email}</span>
                            <span className="muted">
                              {t(`role.${u.role}`)} ·{' '}
                              {(u.organisationId && orgName.get(u.organisationId)) ??
                                t('acct.noOrganisation')}
                            </span>
                            <span className="muted">
                              {u.lastLoginAt
                                ? fill(t('acct.lastLogin'), { when: formatDateTime(u.lastLoginAt) })
                                : t('acct.neverSignedIn')}
                              {u.mustChangePassword && ` · ${t('acct.mustChange')}`}
                            </span>
                          </span>
                          <span
                            className="badge"
                            data-tone={u.status === 'active' ? 'collected' : 'expired'}
                          >
                            {u.status === 'active'
                              ? t('acct.statusActive')
                              : t('acct.statusDisabled')}
                          </span>
                        </div>
                        {!own && (
                          <div className="account-card__actions">
                            <button
                              type="button"
                              className="btn btn--ghost"
                              onClick={() =>
                                setChange({
                                  kind: 'status',
                                  user: u,
                                  status: u.status === 'active' ? 'disabled' : 'active',
                                })
                              }
                            >
                              {u.status === 'active' ? t('acct.disable') : t('acct.enable')}
                            </button>
                            {u.status === 'active' && u.email !== SCHEDULER_EMAIL && (
                              <button
                                type="button"
                                className="btn btn--ghost"
                                onClick={() => setChange({ kind: 'reset', user: u })}
                              >
                                {t('acct.resetPassword')}
                              </button>
                            )}
                            {staff && (
                              <button
                                type="button"
                                className="btn btn--ghost"
                                onClick={() =>
                                  setChange({ kind: 'role', user: u, role: otherRole })
                                }
                              >
                                {t(
                                  otherRole === 'administrator'
                                    ? 'acct.makeAdministrator'
                                    : 'acct.makeCoordinator',
                                )}
                              </button>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Section>

              <Section title={t('acct.newTitle')} lead={t('acct.newLead')}>
                <CreateAccount
                  organisations={orgs}
                  onCreated={async (name, tempPassword) => {
                    setCreated({ kind: 'created', name, tempPassword });
                    await Promise.all([accounts.reload(), audit.reload()]);
                  }}
                />
              </Section>

              <Section title={t('acct.auditTitle')} lead={t('acct.auditLead')}>
                <div className="field">
                  <label className="field__label" htmlFor="audit-action">
                    {t('acct.auditAction')}
                  </label>
                  <select
                    id="audit-action"
                    className="select"
                    value={auditFilter}
                    onChange={(e) => setAuditFilter(e.target.value as AuditAction | '')}
                  >
                    <option value="">{t('acct.auditAll')}</option>
                    {AuditAction.options.map((option) => (
                      <option key={option} value={option}>
                        {t(`audit.action.${option}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <LoadState
                  result={audit}
                  isEmpty={(d) => d.items.length === 0}
                  empty={<Empty icon="list" title={t('acct.auditEmpty')} />}
                >
                  {({ items }) => {
                    const names = new Map(people.map((u) => [u.id, u.fullName]));
                    return (
                      <>
                        <ul className="audit-list" aria-label={t('acct.auditTitle')}>
                          {items.slice(0, AUDIT_SHOWN).map((entry) => (
                            <li className="audit-row" key={entry.id}>
                              <div className="audit-row__top">
                                <strong>
                                  {t(`audit.action.${entry.action}`)}
                                  {entry.targetType === 'users' &&
                                    names.has(entry.targetId) &&
                                    ` · ${names.get(entry.targetId)}`}
                                </strong>
                                <time className="muted" dateTime={entry.at}>
                                  {formatDateTime(entry.at)}
                                </time>
                              </div>
                              <div className="muted">
                                {fill(t('acct.auditBy'), {
                                  name: names.get(entry.userId) ?? t('acct.auditUnknown'),
                                })}
                                {entry.note ? ` · ${entry.note}` : ''}
                              </div>
                            </li>
                          ))}
                        </ul>
                        {items.length > AUDIT_SHOWN && (
                          <p className="muted">
                            {fill(t('acct.auditShown'), { count: AUDIT_SHOWN })}
                          </p>
                        )}
                      </>
                    );
                  }}
                </LoadState>
              </Section>
            </>
          );
        }}
      </LoadState>

      <ConfirmDialog
        open={change !== null}
        title={fill(confirm?.title ?? '', {
          name: confirm?.name ?? '',
          role: change?.kind === 'role' ? t(`role.${change.role}`).toLowerCase() : '',
        })}
        confirmLabel={confirm?.label ?? ''}
        tone={change?.kind === 'status' && change.status === 'active' ? 'go' : 'danger'}
        busy={busy}
        onConfirm={() => void apply()}
        onCancel={() => setChange(null)}
      >
        <p>{fill(confirm?.why ?? '', { name: confirm?.name ?? '' })}</p>
      </ConfirmDialog>
    </>
  );
}
