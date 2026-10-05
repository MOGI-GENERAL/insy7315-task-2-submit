import { Link } from 'react-router-dom';
import { Empty } from '../../components/feedback';
import { useT } from '../../i18n/useT';

export function PendingVerification() {
  const t = useT();
  return (
    <Empty
      icon="shield"
      title={t('pending.title')}
      body={`${t('pending.body')} ${t('pending.message')}`}
      action={
        <Link to="/recipient" className="btn btn--primary">
          {t('pending.continue')}
        </Link>
      }
    />
  );
}
