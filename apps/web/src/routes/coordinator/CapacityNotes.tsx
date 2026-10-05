import { useState } from 'react';
import { CapacityNotesRequest, type Organisation } from '@fedsa/contract';
import { LoadState, PendingButton, useToast } from '../../components/feedback';
import { Field, FormError, useForm } from '../../components/forms';
import { Icon } from '../../components/Icon';
import { VerificationBadge } from '../../components/StatusBadge';
import { Detail, DetailList, PageHead } from '../../components/ui';
import { useData, useLoad } from '../../data';
import { coldChainKey, useT } from '../../i18n/useT';
import { formatKg } from '../../lib/format';
import { distanceFromOffice, storageList } from '../../lib/org';
import './Coordinator.css';

export function CapacityNotes() {
  const { organisations } = useData();
  const t = useT();
  const [selectedId, setSelectedId] = useState('');

  const list = useLoad(async () => {
    const { items } = await organisations.list({});
    return [...items].sort((a, b) => a.name.localeCompare(b.name));
  }, [organisations]);

  return (
    <>
      <PageHead title={t('capacity.title')} lead={t('capacity.lead')} />

      <LoadState result={list}>
        {(all) => {
          const selected = all.find((org) => org.id === selectedId) ?? all[0];
          return (
            <>
              <div className="field">
                <label className="field__label" htmlFor="org-picker">
                  {t('capacity.choose')}
                </label>
                <select
                  id="org-picker"
                  className="select"
                  value={selected?.id ?? ''}
                  onChange={(e) => setSelectedId(e.target.value)}
                >
                  {all.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name} ·{' '}
                      {t(org.type === 'donor' ? 'capacity.donor' : 'capacity.recipient')} ·{' '}
                      {org.suburb}
                    </option>
                  ))}
                </select>
              </div>

              {selected && <OrgPanel key={selected.id} org={selected} onSaved={list.reload} />}
            </>
          );
        }}
      </LoadState>
    </>
  );
}

function OrgPanel({ org, onSaved }: { org: Organisation; onSaved: () => Promise<void> }) {
  const { organisations } = useData();
  const t = useT();
  const toast = useToast();
  const saved = org.capacityNotes ?? '';

  const detail = useLoad(() => organisations.get(org.id), [organisations, org.id]);

  const form = useForm({
    initial: { capacityNotes: saved },
    schema: CapacityNotesRequest,
    onSubmit: async (body) => {
      const { organisation } = await organisations.saveNotes(org.id, body);
      form.reset({ capacityNotes: organisation.capacityNotes ?? '' });
      toast.success(t('capacity.saved'));
      await onSaved();
    },
  });
  const dirty = form.values.capacityNotes !== saved;

  return (
    <div className="panel">
      <div className="row row--between row--wrap">
        <div>
          <h2>{org.name}</h2>
          <p className="muted">
            {t(org.type === 'donor' ? 'capacity.donor' : 'capacity.recipient')} · {org.suburb} ·{' '}
            {distanceFromOffice(org)} km
          </p>
        </div>
        <VerificationBadge status={org.status} />
      </div>

      <hr className="divider" style={{ margin: 'var(--s-4) 0' }} />

      <DetailList>
        <Detail label={t('verify.contact')}>
          {org.contactName}
          <div className="muted">{org.contactPhone}</div>
        </Detail>
        {org.type === 'recipient' && (
          <>
            <Detail label={t('verify.capacity')}>
              {org.maxCapacityKg === null ? t('verify.noLimit') : formatKg(org.maxCapacityKg)}
            </Detail>
            <Detail label={t('verify.storage')}>
              {storageList(org)
                .map((s) => t(coldChainKey(s)))
                .join(', ')}
            </Detail>
            <Detail label={t('verify.transport')}>
              {org.hasTransport ? t('verify.ownVehicle') : t('verify.needsDriver')}
            </Detail>
            <Detail label={t('verify.mealsPerDay')}>{org.mealsPerDay ?? '-'}</Detail>
          </>
        )}
        {detail.data && (
          <>
            <Detail label={t(org.type === 'donor' ? 'capacity.offersPosted' : 'capacity.claims')}>
              {org.type === 'donor' ? detail.data.stats.offersPosted : detail.data.stats.claimsMade}
            </Detail>
            {org.type === 'recipient' && (
              <Detail label={t('capacity.released')}>{detail.data.stats.claimsReleased}</Detail>
            )}
            <Detail label={t('capacity.collected')}>
              {formatKg(detail.data.stats.kgCollected)}
            </Detail>
          </>
        )}
      </DetailList>

      <hr className="divider" style={{ margin: 'var(--s-4) 0' }} />

      <form {...form.formProps}>
        <FormError form={form} />
        <Field
          form={form}
          name="capacityNotes"
          label={t('capacity.notesLabel')}
          hint={t('capacity.notesHint')}
        >
          {(props) => (
            <textarea
              {...props}
              className="textarea"
              rows={7}
              maxLength={1000}
              placeholder={t('capacity.notesPlaceholder')}
            />
          )}
        </Field>

        <PendingButton type="submit" pending={form.pending} disabled={!dirty}>
          <Icon name="check" size={18} />
          {dirty ? t('capacity.save') : t('capacity.saveDone')}
        </PendingButton>
      </form>
    </div>
  );
}
