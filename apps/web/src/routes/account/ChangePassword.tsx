import { useAuth } from '../../auth/context';
import { Empty } from '../../components/feedback';
import { useT } from '../../i18n/useT';

/** placeholder until the account screens exist. sign-out stops a forced change trapping anyone */
export function ChangePassword() {
  const t = useT();
  const { logout } = useAuth();
  return (
    <Empty
      icon="shield"
      title={t('account.changePassword')}
      body={t('account.mustChange')}
      action={
        <button type="button" className="btn btn--secondary" onClick={() => void logout()}>
          {t('nav.signOut')}
        </button>
      }
    />
  );
}
