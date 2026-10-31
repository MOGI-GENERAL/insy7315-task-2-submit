import { useId } from 'react';
import type { DriverStop } from '@fedsa/contract';
import { Icon } from '../../components/Icon';
import { Loading } from '../../components/feedback/Loading';
import { fill } from '../../i18n/useFormat';
import { categoryKey, coldChainKey, useT } from '../../i18n/useT';
import { mapsLink } from '../../lib/driverLink';
import { formatSaWhen } from '../../lib/driverText';
import { formatKg } from '../../lib/format';
import type { DriverState } from './state';

function Stop({ heading, stop }: { heading: string; stop: DriverStop }) {
  const t = useT();
  const id = useId();
  return (
    <section className="card driver__stop" aria-labelledby={id}>
      <h2 id={id}>{heading}</h2>
      <p className="driver__org">{stop.organisationName}</p>
      <p>{stop.address}</p>
      <a
        className="btn btn--secondary btn--block"
        href={mapsLink(stop.address)}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Icon name="pin" size={18} />
        {fill(t('driver.openMaps'), { address: stop.address })}
        <span className="sr-only"> {t('driver.newTab')}</span>
      </a>
      <p>
        <span className="muted">{t('driver.contact')}</span> {stop.contactName}
      </p>
      <a
        className="btn btn--primary btn--block"
        href={`tel:${stop.contactPhone.replace(/[^\d+]/g, '')}`}
      >
        <Icon name="phone" size={18} />
        {fill(t('driver.callContact'), { name: stop.contactName, phone: stop.contactPhone })}
      </a>
    </section>
  );
}

export function DriverView({ state, onRetry }: { state: DriverState; onRetry: () => void }) {
  const t = useT();
  const foodId = useId();

  switch (state.kind) {
    case 'loading':
      return <Loading />;

    case 'gone':
      return (
        <div className="driver__notice">
          <Icon name="alert" size={32} />
          <h1>{t('driver.goneTitle')}</h1>
          <p>{t('driver.gone')}</p>
        </div>
      );

    case 'failed':
      return (
        <div className="driver__notice" role="alert">
          <Icon name="alert" size={32} />
          <h1>{t('driver.failed')}</h1>
          <button type="button" className="btn btn--secondary" onClick={onRetry}>
            <Icon name="refresh" size={18} />
            {t('feedback.retry')}
          </button>
        </div>
      );

    case 'ready': {
      const d = state.data;
      return (
        <article className="driver__sheet">
          <header>
            <p className="driver__eyebrow">
              {fill(t('driver.reference'), { reference: d.reference })}
            </p>
            <h1>{d.title}</h1>
            <p className="muted">{fill(t('driver.for'), { name: d.driverName })}</p>
          </header>

          {d.coldChain !== 'ambient' && (
            <div className="banner" data-tone="warn">
              <Icon name="alert" size={20} />
              <div className="banner__body">
                <strong>{t(coldChainKey(d.coldChain))}</strong>
              </div>
            </div>
          )}

          <section className="card driver__stop" aria-labelledby={foodId}>
            <h2 id={foodId}>{t('driver.foodTitle')}</h2>
            <dl className="driver__facts">
              <dt>{t('driver.category')}</dt>
              <dd>{t(categoryKey(d.category))}</dd>
              <dt>{t('driver.quantity')}</dt>
              <dd>{formatKg(d.quantityKg)}</dd>
              <dt>{t('driver.temperature')}</dt>
              <dd>{t(coldChainKey(d.coldChain))}</dd>
              {d.description && (
                <>
                  <dt>{t('driver.notes')}</dt>
                  <dd>{d.description}</dd>
                </>
              )}
              <dt>{t('driver.collectBy')}</dt>
              <dd>{formatSaWhen(d.collectionDeadline)}</dd>
              {d.scheduledFor && (
                <>
                  <dt>{t('driver.pickupTime')}</dt>
                  <dd>{formatSaWhen(d.scheduledFor)}</dd>
                </>
              )}
            </dl>
          </section>

          <Stop heading={t('driver.pickupTitle')} stop={d.pickup} />
          <Stop heading={t('driver.dropOffTitle')} stop={d.dropOff} />
        </article>
      );
    }
  }
}
