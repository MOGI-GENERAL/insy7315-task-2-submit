import { useNavigate } from 'react-router-dom';
import { ChangePasswordRequest } from '@fedsa/contract';
import { roleHome, useAuth, useSession } from '../../auth/context';
import { PendingButton, useToast } from '../../components/feedback';
import { Field, FormError, useForm } from '../../components/forms';
import type { Validator } from '../../components/forms';
import { Banner, PageHead } from '../../components/ui';
import { useData } from '../../data/context';
import { useT } from '../../i18n/useT';
import { localised, localiseError } from './messages';
import './Account.css';

interface Values {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/** forced at first sign-in for accounts an administrator created, and reachable from the menu */
export function ChangePassword() {
  const { user } = useSession();
  const { logout, refresh } = useAuth();
  const { auth } = useData();
  const toast = useToast();
  const navigate = useNavigate();
  const t = useT();

  const request = localised<Values, ChangePasswordRequest>(
    ChangePasswordRequest,
    t,
    ({ currentPassword, newPassword }) => ({ currentPassword, newPassword }),
  );

  // the confirmation is checked here only. the API never sees it
  const schema: Validator<ChangePasswordRequest> = {
    safeParse(values) {
      const result = request.safeParse(values);
      const { newPassword, confirmPassword } = values as Values;
      const mismatch =
        confirmPassword !== newPassword
          ? [{ path: ['confirmPassword'], message: t('account.mismatch'), code: 'custom' }]
          : [];
      if (result.success && mismatch.length === 0) return result;
      const issues = [...(result.success ? [] : result.error.issues), ...mismatch];
      return { success: false, error: { issues } };
    },
  };

  const form = useForm<Values, ChangePasswordRequest>({
    initial: { currentPassword: '', newPassword: '', confirmPassword: '' },
    schema,
    async onSubmit(body) {
      try {
        await auth.changePassword(body);
      } catch (error) {
        throw localiseError(error, t);
      }
      await refresh();
      toast.success(t('account.passwordChanged'));
      navigate(roleHome[user.role], { replace: true });
    },
  });

  return (
    <div className="account">
      <PageHead title={t('account.changePassword')} lead={user.email} />

      {user.mustChangePassword && (
        <Banner tone="warn" title={t('account.mustChange')}>
          {t('account.otherDevices')}
        </Banner>
      )}

      <form className="form-screen" {...form.formProps}>
        <FormError form={form} />
        <Field form={form} name="currentPassword" label={t('account.currentPassword')}>
          {(props) => (
            <input {...props} className="input" type="password" autoComplete="current-password" />
          )}
        </Field>
        <Field
          form={form}
          name="newPassword"
          label={t('account.newPassword')}
          hint={t('account.newPasswordHint')}
        >
          {(props) => (
            <input {...props} className="input" type="password" autoComplete="new-password" />
          )}
        </Field>
        <Field form={form} name="confirmPassword" label={t('account.confirmPassword')}>
          {(props) => (
            <input {...props} className="input" type="password" autoComplete="new-password" />
          )}
        </Field>

        {!user.mustChangePassword && <p className="field__hint">{t('account.otherDevices')}</p>}

        <div className="form-screen__actions">
          {user.mustChangePassword && (
            <button type="button" className="btn btn--secondary" onClick={() => void logout()}>
              {t('nav.signOut')}
            </button>
          )}
          <PendingButton
            type="submit"
            className="btn btn--primary btn--lg"
            pending={form.pending}
            pendingLabel={t('account.changing')}
          >
            {t('account.changePassword')}
          </PendingButton>
        </div>
      </form>
    </div>
  );
}
