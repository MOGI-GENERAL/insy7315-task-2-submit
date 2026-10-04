/* ORG PROFILE — DRIVES FEED ELIGIBILITY FILTER */

import { useState } from 'react';
import type { FormEvent } from 'react';
import { Icon } from '../../components/Icon';
import { Banner, PageHead } from '../../components/ui';
import { useApp, useCurrentOrg } from '../../store/context';
import { checkEligibility } from '../../store/selectors';
import { useT, coldChainKey } from '../../i18n/useT';
import { useNow } from '../../lib/useNow';
import type { ColdChain } from '../../store/types';
import './Recipient.css';
import { storageFields, storageList } from '../../lib/org';

const storageOptions: ColdChain[] = ['ambient', 'refrigerated', 'frozen'];

export function RecipientProfile() {
  const { state } = useApp();
  const org = useCurrentOrg()!;
  const t = useT();
  const now = useNow();

  const [capacity, setCapacity] = useState(String(org.maxCapacityKg ?? 0));
  const [storage, setStorage] = useState<ColdChain[]>(storageList(org));
  const [hasTransport, setHasTransport] = useState(Boolean(org.hasTransport));
  const [saved, setSaved] = useState(false);

  const kg = Number(capacity);

  /* LIVE PREVIEW OF SETTINGS */
  const live = state.offers.filter(
    (o) => o.status === 'open' && new Date(o.collectionDeadline).getTime() > now,
  );
  const wouldSee = live.filter(
    (o) =>
      checkEligibility({ ...org, maxCapacityKg: kg, ...storageFields(storage), hasTransport }, o)
        .eligible,
  ).length;

  function toggleStorage(option: ColdChain) {
    setSaved(false);
    setStorage((current) =>
      current.includes(option) ? current.filter((c) => c !== option) : [...current, option],
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    /* PROTOTYPE: NOT PERSISTED */
    setSaved(true);
  }

  return (
    <form className="form-screen" onSubmit={submit}>
      <PageHead title={t('profile.title')} lead={`${org.name}, ${org.suburb}`} />

      <div className="profile-why">
        <Icon name="shield" size={20} />
        <span>
          {t('profile.why')} Nothing here is a score, and no organisation is ranked against another.
        </span>
      </div>

      {saved && (
        <Banner tone="good" title={t('profile.saved')} onDismiss={() => setSaved(false)}>
          In the built system this would be written to your organisation record and applied to the
          next offer posted.
        </Banner>
      )}

      <div className="field">
        <label className="field__label" htmlFor="cap">
          {t('profile.capacity')}
        </label>
        <div className="qty">
          <input
            id="cap"
            className="input"
            type="number"
            inputMode="numeric"
            min="1"
            value={capacity}
            onChange={(e) => {
              setCapacity(e.target.value);
              setSaved(false);
            }}
            aria-describedby="cap-hint"
          />
          <span className="qty__unit">kg</span>
        </div>
        <span className="field__hint" id="cap-hint">
          The most you can take in one collection. Offers larger than this are not shown to you.
        </span>
      </div>

      <fieldset className="field">
        <legend className="field__label">{t('profile.storageWeHave')}</legend>
        <div className="choices">
          {storageOptions.map((option) => (
            <label key={option} className="choice">
              <input
                type="checkbox"
                checked={storage.includes(option)}
                onChange={() => toggleStorage(option)}
              />
              <span>{t(coldChainKey(option))}</span>
            </label>
          ))}
        </div>
        <span className="field__hint">
          Only tick what you can genuinely hold. A shelter with a freezer but no fridge should not
          be offered chilled dairy.
        </span>
      </fieldset>

      <fieldset className="field">
        <legend className="field__label">{t('profile.transport')}</legend>
        <div className="stack stack--tight">
          <label className="toggle">
            <input
              type="radio"
              name="transport"
              checked={hasTransport}
              onChange={() => {
                setHasTransport(true);
                setSaved(false);
              }}
            />
            <span className="toggle__text">
              {t('profile.hasTransport')}
              <small>You collect your own claims.</small>
            </span>
          </label>
          <label className="toggle">
            <input
              type="radio"
              name="transport"
              checked={!hasTransport}
              onChange={() => {
                setHasTransport(false);
                setSaved(false);
              }}
            />
            <span className="toggle__text">
              {t('profile.noTransport')}
              <small>FEDSA arranges a driver. This never reduces the offers you are shown.</small>
            </span>
          </label>
        </div>
      </fieldset>

      <div className="profile-effect" aria-live="polite">
        <strong>What this means right now</strong>
        <p>
          With these settings you would see <strong>{wouldSee}</strong> of the {live.length} offers
          currently live on the platform.{' '}
          {hasTransport
            ? 'You would collect them yourselves.'
            : 'A driver would be arranged for each one you claim.'}
        </p>
      </div>

      <button
        type="submit"
        className="btn btn--primary btn--lg"
        style={{ marginTop: 'var(--s-5)' }}
      >
        {t('profile.save')}
      </button>
    </form>
  );
}
