import { dataMode } from '../data';
import { useT } from '../i18n/useT';
import { Icon } from './Icon';

export function DemoDataBanner() {
  const t = useT();
  if (dataMode() !== 'fake') return null;

  return (
    <div className="demo-banner" role="status">
      <Icon name="alert" size={18} />
      <p>
        <strong>{t('demo.title')}</strong> {t('demo.body')}
      </p>
    </div>
  );
}
