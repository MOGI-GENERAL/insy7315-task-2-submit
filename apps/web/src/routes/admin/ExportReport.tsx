import { Icon } from '../../components/Icon';
import { Banner, PageHead } from '../../components/ui';
import { dataMode } from '../../data';
import { useT } from '../../i18n/useT';
import { RangePicker } from './RangePicker';
import { useRange } from './useRange';
import './Admin.css';

export function ExportReport() {
  const t = useT();
  const range = useRange();
  const href = range.range
    ? `/api/reports/export?${new URLSearchParams({ ...range.range, format: 'csv' }).toString()}`
    : null;

  return (
    <>
      <PageHead title={t('rep.exportTitle')} lead={t('rep.exportLead')} />
      <RangePicker range={range} />
      {dataMode() === 'fake' ? (
        <Banner tone="info">{t('rep.exportFake')}</Banner>
      ) : (
        href && (
          <a href={href} download className="btn btn--primary btn--lg">
            <Icon name="download" size={20} />
            {t('rep.exportDownload')}
          </a>
        )
      )}
    </>
  );
}
