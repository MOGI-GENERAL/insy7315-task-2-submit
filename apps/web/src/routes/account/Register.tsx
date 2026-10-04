import { useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { RegisterRequest } from '@fedsa/contract';
import type { Language } from '@fedsa/contract';
import { useAuth } from '../../auth/context';
import { Icon } from '../../components/Icon';
import { LanguagePicker } from '../../components/LanguagePicker';
import { LogoMark } from '../../components/Logo';
import { SuburbSelect } from '../../components/SuburbSelect';
import { PendingButton } from '../../components/feedback';
import { Checkbox, Field, FormError, useForm } from '../../components/forms';
import { languageNames } from '../../i18n/strings';
import { coldChainKey, useLanguage, useT } from '../../i18n/useT';
import { localised, localiseError } from './messages';
import { PRIVACY_PATH, homeAfterRegistering } from './paths';
import '../Login.css';
import './Account.css';

type Side = 'donor' | 'recipient';

interface RegisterValues {
  role: Side;
  organisation: {
    name: string;
    addressLine: string;
    suburb: string;
    contactName: string;
    contactPhone: string;
    contactEmail: string;
    taxReferenceNumber: string;
    storageAmbient: boolean;
    storageRefrigerated: boolean;
    storageFrozen: boolean;
    maxCapacityKg?: number;
    hasTransport: boolean;
    mealsPerDay?: number;
  };
  user: {
    fullName: string;
    email: string;
    password: string;
    phone: string;
    languagePreference: Language;
  };
  consent: boolean;
}

const STORAGE = ['ambient', 'refrigerated', 'frozen'] as const;
const STORAGE_FIELD = {
  ambient: 'organisation.storageAmbient',
  refrigerated: 'organisation.storageRefrigerated',
  frozen: 'organisation.storageFrozen',
} as const;

/** one form holds both sides, and only the chosen side's fields are sent */
function toRequest({ role, organisation, user, consent }: RegisterValues) {
  const {
    taxReferenceNumber,
    storageAmbient,
    storageRefrigerated,
    storageFrozen,
    maxCapacityKg,
    hasTransport,
    mealsPerDay,
    ...shared
  } = organisation;
  return {
    role,
    organisation:
      role === 'donor'
        ? { ...shared, taxReferenceNumber: taxReferenceNumber.trim() || undefined }
        : {
            ...shared,
            storageAmbient,
            storageRefrigerated,
            storageFrozen,
            maxCapacityKg,
            hasTransport,
            mealsPerDay,
          },
    user,
    consent,
  };
}

export function Register() {
  const auth = useAuth();
  const language = useLanguage();
  const t = useT();

  const form = useForm<RegisterValues, RegisterRequest>({
    initial: {
      role: 'recipient',
      organisation: {
        name: '',
        addressLine: '',
        suburb: '',
        contactName: '',
        contactPhone: '',
        contactEmail: '',
        taxReferenceNumber: '',
        storageAmbient: true,
        storageRefrigerated: false,
        storageFrozen: false,
        hasTransport: false,
      },
      user: { fullName: '', email: '', password: '', phone: '', languagePreference: language },
      consent: false,
    },
    schema: localised(RegisterRequest, t, toRequest),
    async onSubmit(body) {
      try {
        await auth.register(body);
      } catch (error) {
        throw localiseError(error, t);
      }
    },
  });

  // whoever switches the page to isiXhosa most likely wants their messages in it too
  const { set } = form;
  useEffect(() => set('user.languagePreference', language), [set, language]);

  if (auth.state.status === 'signedIn') {
    return <Navigate to={homeAfterRegistering(auth.state.session)} replace />;
  }

  const { role } = form.values;

  return (
    <div className="login">
      <div className="login__inner">
        <header className="login__head">
          <span className="login__logo">
            <LogoMark size={56} />
          </span>
          <img className="login__wordmark" src="/FEDSA-word-mark.svg" alt="FEDSA" />
        </header>

        <LanguagePicker />

        <form className="login__form register" {...form.formProps}>
          <h1 className="register__title">{t('register.title')}</h1>
          <p className="register__lead">{t('register.lead')}</p>
          <FormError form={form} />

          <fieldset className="field">
            <legend className="field__label">{t('register.role')}</legend>
            <div className="stack stack--tight">
              {(['recipient', 'donor'] as const).map((side) => (
                <label key={side} className="toggle">
                  <input
                    type="radio"
                    name="role"
                    checked={role === side}
                    onChange={() => form.set('role', side)}
                  />
                  <span className="toggle__text">
                    {t(side === 'donor' ? 'register.roleDonor' : 'register.roleRecipient')}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="register__section">
            <legend className="register__heading">{t('register.organisation')}</legend>
            <Field form={form} name="organisation.name" label={t('register.orgName')}>
              {(props) => <input {...props} className="input" autoComplete="organization" />}
            </Field>
            <Field form={form} name="organisation.addressLine" label={t('register.address')}>
              {(props) => <input {...props} className="input" autoComplete="street-address" />}
            </Field>
            <Field
              form={form}
              name="organisation.suburb"
              label={t('register.suburb')}
              hint={t('register.suburbHint')}
            >
              {(props) => <SuburbSelect {...props} />}
            </Field>
            <Field form={form} name="organisation.contactName" label={t('register.contactName')}>
              {(props) => <input {...props} className="input" autoComplete="name" />}
            </Field>
            <Field
              form={form}
              name="organisation.contactPhone"
              label={t('register.contactPhone')}
              hint={t('dispatch.phoneHint')}
            >
              {(props) => <input {...props} className="input" type="tel" autoComplete="tel" />}
            </Field>
            <Field form={form} name="organisation.contactEmail" label={t('register.contactEmail')}>
              {(props) => <input {...props} className="input" type="email" autoComplete="email" />}
            </Field>

            {role === 'donor' ? (
              <Field
                form={form}
                name="organisation.taxReferenceNumber"
                label={t('register.taxRef')}
                hint={t('register.taxRefHint')}
                optional
              >
                {(props) => <input {...props} className="input" />}
              </Field>
            ) : (
              <>
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

                <Field
                  form={form}
                  name="organisation.maxCapacityKg"
                  label={t('profile.capacity')}
                  hint={t('register.capacityHint')}
                  kind="number"
                  optional
                >
                  {(props) => (
                    <div className="qty">
                      <input
                        {...props}
                        className="input"
                        type="number"
                        inputMode="decimal"
                        min="1"
                      />
                      <span className="qty__unit">{t('common.kg')}</span>
                    </div>
                  )}
                </Field>

                <fieldset className="field">
                  <legend className="field__label">{t('profile.transport')}</legend>
                  <div className="stack stack--tight">
                    {[true, false].map((has) => (
                      <label key={String(has)} className="toggle">
                        <input
                          type="radio"
                          name="hasTransport"
                          checked={form.values.organisation.hasTransport === has}
                          onChange={() => form.set('organisation.hasTransport', has)}
                        />
                        <span className="toggle__text">
                          {t(has ? 'profile.hasTransport' : 'profile.noTransport')}
                          <small>
                            {t(has ? 'profile.hasTransportHint' : 'profile.noTransportHint')}
                          </small>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <Field
                  form={form}
                  name="organisation.mealsPerDay"
                  label={t('profile.mealsPerDay')}
                  kind="number"
                  optional
                >
                  {(props) => (
                    <input {...props} className="input" type="number" inputMode="numeric" min="1" />
                  )}
                </Field>
              </>
            )}
          </fieldset>

          <fieldset className="register__section">
            <legend className="register__heading">{t('register.you')}</legend>
            <Field form={form} name="user.fullName" label={t('register.fullName')}>
              {(props) => <input {...props} className="input" autoComplete="name" />}
            </Field>
            <Field
              form={form}
              name="user.email"
              label={t('login.email')}
              hint={t('register.emailHint')}
            >
              {(props) => (
                <input {...props} className="input" type="email" autoComplete="username" />
              )}
            </Field>
            <Field
              form={form}
              name="user.password"
              label={t('login.password')}
              hint={t('register.passwordHint')}
            >
              {(props) => (
                <input {...props} className="input" type="password" autoComplete="new-password" />
              )}
            </Field>
            <Field
              form={form}
              name="user.phone"
              label={t('register.phone')}
              hint={t('register.phoneHint')}
            >
              {(props) => <input {...props} className="input" type="tel" autoComplete="tel" />}
            </Field>
            <Field
              form={form}
              name="user.languagePreference"
              label={t('register.language')}
              hint={t('register.languageHint')}
            >
              {(props) => (
                <select {...props} className="select">
                  {(Object.keys(languageNames) as Language[]).map((code) => (
                    <option key={code} value={code}>
                      {languageNames[code]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </fieldset>

          <Checkbox form={form} name="consent" label={t('register.consent')} />
          <p className="register__privacy">
            <Icon name="shield" size={16} />
            {/* a new tab, so the half-filled form is still there afterwards */}
            <Link to={PRIVACY_PATH} target="_blank" rel="noopener">
              {t('register.privacyLink')}
            </Link>
          </p>

          <PendingButton
            type="submit"
            className="btn btn--primary btn--block btn--lg"
            pending={form.pending}
            pendingLabel={t('register.submitting')}
          >
            {t('register.submit')}
          </PendingButton>
          <p className="login__help">
            <Link to="/login">{t('register.haveAccount')}</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
