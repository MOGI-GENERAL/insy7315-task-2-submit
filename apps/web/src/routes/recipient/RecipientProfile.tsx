import {
  UpdateRecipientOrganisationRequest,
  type ColdChain,
  type RecipientOrganisation,
} from '@fedsa/contract';
import { useAuth } from '../../auth/context';
import { useData, useLoad } from '../../data';
import { LoadState, PendingButton, useToast } from '../../components/feedback';
import { Checkbox, Field, FormError, useForm } from '../../components/forms';
import type { Validator } from '../../components/forms';
import { Icon } from '../../components/Icon';
import { SuburbSelect } from '../../components/SuburbSelect';
import { PageHead } from '../../components/ui';
import { useT, coldChainKey } from '../../i18n/useT';
import './Recipient.css';

const STORAGE: ColdChain[] = ['ambient', 'refrigerated', 'frozen'];
const STORAGE_FIELD = {
  ambient: 'storageAmbient',
  refrigerated: 'storageRefrigerated',
  frozen: 'storageFrozen',
} as const;

interface Values {
  suburb: string;
  storageAmbient: boolean;
  storageRefrigerated: boolean;
  storageFrozen: boolean;
  maxCapacityKg: number | undefined;
  hasTransport: boolean;
}

/** an empty capacity box means no limit, which the API takes as null */
const profileSchema: Validator<UpdateRecipientOrganisationRequest> = {
  safeParse: (v) => {
    const values = v as Values;
    return UpdateRecipientOrganisationRequest.safeParse({
      ...values,
      maxCapacityKg: values.maxCapacityKg ?? null,
    });
  },
};

function valuesOf(org: RecipientOrganisation): Values {
  return {
    suburb: org.suburb,
    storageAmbient: org.storageAmbient,
    storageRefrigerated: org.storageRefrigerated,
    storageFrozen: org.storageFrozen,
    maxCapacityKg: org.maxCapacityKg ?? undefined,
    hasTransport: org.hasTransport,
  };
}

export function RecipientProfile() {
  const { organisations } = useData();
  const t = useT();
  const mine = useLoad(() => organisations.mine(), [organisations]);
  const org = mine.data?.organisation;

  return (
    <div className="form-screen">
      <PageHead title={t('profile.title')} lead={org ? `${org.name}, ${org.suburb}` : undefined} />

      <LoadState result={mine}>
        {({ organisation }) =>
          organisation.type === 'recipient' && (
            <ProfileForm key={organisation.id} org={organisation} onSaved={mine.reload} />
          )
        }
      </LoadState>
    </div>
  );
}

function ProfileForm({
  org,
  onSaved,
}: {
  org: RecipientOrganisation;
  onSaved: () => Promise<void>;
}) {
  const { organisations } = useData();
  const { refresh } = useAuth();
  const toast = useToast();
  const t = useT();

  const form = useForm({
    initial: valuesOf(org),
    schema: profileSchema,
    onSubmit: async (body) => {
      const { organisation } = await organisations.updateMine(body);
      if (organisation.type === 'recipient') form.reset(valuesOf(organisation));
      toast.success(t('profile.saved'));
      // the feed and the claim screen read transport and suburb from the session
      await Promise.all([onSaved(), refresh()]);
    },
  });

  return (
    <form {...form.formProps}>
      <div className="profile-why">
        <Icon name="shield" size={20} />
        <span>
          {t('profile.why')} {t('profile.notScore')}
        </span>
      </div>

      <FormError form={form} />

      <Field form={form} name="suburb" label={t('register.suburb')} hint={t('register.suburbHint')}>
        {(props) => <SuburbSelect {...props} />}
      </Field>

      <Field
        form={form}
        name="maxCapacityKg"
        label={t('profile.capacity')}
        hint={`${t('profile.capacityHint')} ${t('register.capacityHint')}`}
        kind="number"
        optional
      >
        {(props) => (
          <div className="qty">
            <input {...props} className="input" type="number" inputMode="decimal" min="1" />
            <span className="qty__unit">{t('common.kg')}</span>
          </div>
        )}
      </Field>

      <fieldset className="field">
        <legend className="field__label">{t('profile.storageWeHave')}</legend>
        <div className="choices">
          {STORAGE.map((option) => (
            <Checkbox
              key={option}
              form={form}
              name={STORAGE_FIELD[option]}
              label={t(coldChainKey(option))}
            />
          ))}
        </div>
        <span className="field__hint">{t('profile.storageHint')}</span>
      </fieldset>

      <fieldset className="field">
        <legend className="field__label">{t('profile.transport')}</legend>
        <div className="stack stack--tight">
          {[true, false].map((has) => (
            <label key={String(has)} className="toggle">
              <input
                type="radio"
                name="hasTransport"
                checked={form.values.hasTransport === has}
                onChange={() => form.set('hasTransport', has)}
              />
              <span className="toggle__text">
                {t(has ? 'profile.hasTransport' : 'profile.noTransport')}
                <small>{t(has ? 'profile.hasTransportHint' : 'profile.noTransportHint')}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <PendingButton
        type="submit"
        className="btn btn--primary btn--lg"
        pending={form.pending}
        style={{ marginTop: 'var(--s-5)' }}
      >
        {t('profile.save')}
      </PendingButton>
    </form>
  );
}
