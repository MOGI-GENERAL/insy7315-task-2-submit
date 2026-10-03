/* POST SURPLUS FORM — FAST DEFAULTS + LIVE REACH COUNT */

import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { PhotoPicker } from '../../components/PhotoPicker';
import { Icon } from '../../components/Icon';
import { PageHead } from '../../components/ui';
import { useApp, useCurrentOrg, useCurrentUser } from '../../store/context';
import { checkEligibility } from '../../store/selectors';
import { useT, categoryKey, coldChainKey } from '../../i18n/useT';
import { mealsFromKg } from '../../lib/format';
import type { ColdChain, FoodCategory } from '../../store/types';
import './PostOffer.css';
import { canClaim } from '../../lib/org';

const categories: FoodCategory[] = ['bakery', 'produce', 'dairy', 'prepared', 'dry', 'other'];
const coldChains: ColdChain[] = ['ambient', 'refrigerated', 'frozen'];

/* LOCAL DATETIME-LOCAL FORMAT */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function inMinutes(mins: number): string {
  return toLocalInput(new Date(Date.now() + mins * 60_000));
}

function tomorrowAt(hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  return toLocalInput(d);
}

export function PostOffer() {
  const { state, dispatch } = useApp();
  const user = useCurrentUser()!;
  const org = useCurrentOrg()!;
  const navigate = useNavigate();
  const t = useT();

  const [title, setTitle] = useState('');
  const [quantity, setQuantity] = useState('');
  const [category, setCategory] = useState<FoodCategory>('bakery');
  const [coldChain, setColdChain] = useState<ColdChain>('ambient');
  const [photo, setPhoto] = useState<string | null>('bread');
  const [deadline, setDeadline] = useState(inMinutes(90));
  const [availableFrom, setAvailableFrom] = useState(toLocalInput(new Date()));
  const [notes, setNotes] = useState('');
  const [touched, setTouched] = useState(false);

  const kg = Number(quantity);
  const titleValid = title.trim().length >= 3;
  const kgValid = Number.isFinite(kg) && kg > 0;
  const deadlineValid = new Date(deadline).getTime() > new Date(availableFrom).getTime();
  const valid = titleValid && kgValid && deadlineValid;

  /* SAME ELIGIBILITY CHECK AS RECIPIENT FEED — REACH COUNT MATCHES ACTUAL NOTIFY */
  const candidates = useMemo(() => {
    if (!kgValid) return [];
    const draft = { offeredQuantityKg: kg, coldChain };
    return state.organisations.filter(
      (o) => o.type === 'recipient' && canClaim(o) && checkEligibility(o, draft).eligible,
    );
  }, [state.organisations, kg, kgValid, coldChain]);

  function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!valid) return;

    dispatch({
      type: 'POST_OFFER',
      userId: user.id,
      organisationId: org.id,
      notifiedOrganisationIds: candidates.map((c) => c.id),
      offer: {
        title: title.trim(),
        description: notes.trim(),
        category,
        offeredQuantityKg: kg,
        coldChain,
        photo,
        availableFrom: new Date(availableFrom).toISOString(),
        collectionDeadline: new Date(deadline).toISOString(),
      },
    });

    navigate('/donor/posted');
  }

  return (
    <form className="post-form" onSubmit={submit} noValidate>
      <PageHead title={t('post.title')} lead={`${org.name}, ${org.suburb}`} />

      <div className="field">
        <label className="field__label" htmlFor="offer-title">
          {t('post.whatIsIt')}
        </label>
        <input
          id="offer-title"
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('post.titleHint')}
          autoComplete="off"
          autoFocus
          aria-describedby="offer-title-hint"
          aria-invalid={touched && !titleValid}
        />
        <span className="field__hint" id="offer-title-hint">
          Plain and specific. Whoever collects it reads this first.
        </span>
        {touched && !titleValid && (
          <span className="field__error" role="alert">
            Say what the food is, in a few words.
          </span>
        )}
      </div>

      <div className="field">
        <label className="field__label" htmlFor="offer-kg">
          {t('post.howMuch')}
        </label>
        <div className="qty">
          <input
            id="offer-kg"
            className="input"
            type="number"
            inputMode="decimal"
            min="1"
            max="5000"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            aria-invalid={touched && !kgValid}
            aria-describedby="offer-kg-hint"
          />
          <span className="qty__unit">kg</span>
        </div>
        <span className="field__hint" id="offer-kg-hint">
          {kgValid
            ? `About ${mealsFromKg(kg).toLocaleString('en-ZA')} meals at the 0.4 kg standard.`
            : 'An estimate is fine. It is corrected at handover.'}
        </span>
        {touched && !kgValid && (
          <span className="field__error" role="alert">
            Enter a weight in kilograms.
          </span>
        )}
      </div>

      <fieldset className="field">
        <legend className="field__label">{t('offer.category')}</legend>
        <div className="choices">
          {categories.map((c) => (
            <label key={c} className="choice">
              <input
                type="radio"
                name="category"
                value={c}
                checked={category === c}
                onChange={() => {
                  setCategory(c);
                  if (c === 'dairy' || c === 'prepared') setColdChain('refrigerated');
                  if (c === 'bakery' || c === 'dry') setColdChain('ambient');
                }}
              />
              <span>{t(categoryKey(c))}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend className="field__label">{t('post.storageQuestion')}</legend>
        <div className="choices">
          {coldChains.map((c) => (
            <label key={c} className="choice">
              <input
                type="radio"
                name="coldchain"
                value={c}
                checked={coldChain === c}
                onChange={() => setColdChain(c)}
              />
              <span>{t(coldChainKey(c))}</span>
            </label>
          ))}
        </div>
        <span className="field__hint">
          This decides who is offered the food. Only organisations that can store it are shown it.
        </span>
      </fieldset>

      <fieldset className="field">
        <legend className="field__label">{t('post.collectBy')}</legend>
        <div className="choices">
          {[
            { label: 'In 1 hour', value: inMinutes(60) },
            { label: 'In 90 minutes', value: inMinutes(90) },
            { label: 'In 3 hours', value: inMinutes(180) },
            { label: 'Tomorrow 17:00', value: tomorrowAt(17) },
          ].map((preset) => (
            <label key={preset.label} className="choice">
              <input
                type="radio"
                name="deadline-preset"
                checked={deadline === preset.value}
                onChange={() => setDeadline(preset.value)}
              />
              <span>{preset.label}</span>
            </label>
          ))}
        </div>
        <label className="field__hint" htmlFor="offer-deadline">
          Or set an exact time
        </label>
        <input
          id="offer-deadline"
          className="input"
          type="datetime-local"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          aria-invalid={touched && !deadlineValid}
        />
        {touched && !deadlineValid && (
          <span className="field__error" role="alert">
            The collection deadline has to be after the food becomes available.
          </span>
        )}
      </fieldset>

      <details className="post-form__more">
        <summary>More options</summary>

        <div className="field">
          <label className="field__label" htmlFor="offer-from">
            {t('post.availableFrom')}
          </label>
          <input
            id="offer-from"
            className="input"
            type="datetime-local"
            value={availableFrom}
            onChange={(e) => setAvailableFrom(e.target.value)}
          />
          <span className="field__hint">
            Set this to a later day to let organisations plan ahead rather than react.
          </span>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="offer-notes">
            {t('post.notes')} <span className="muted">({t('common.optional')})</span>
          </label>
          <textarea
            id="offer-notes"
            className="textarea"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('post.notesHint')}
          />
        </div>
      </details>

      <PhotoPicker
        value={photo}
        onChange={setPhoto}
        label={t('post.addPhoto')}
        hint="A photograph is what makes a recipient confident the food is worth the trip."
      />

      <div className="post-form__reach" aria-live="polite">
        <Icon name="people" size={20} />
        <div>
          <strong>
            {candidates.length} organisation{candidates.length === 1 ? '' : 's'} can take this
          </strong>
          <span>
            {candidates.length === 0
              ? 'Nobody can store this quantity in these conditions. Try a smaller amount.'
              : 'All of them are notified at once, not one at a time.'}
          </span>
        </div>
      </div>

      <button type="submit" className="btn btn--primary btn--lg btn--block">
        <Icon name="check" size={20} />
        {t('post.submit')}
      </button>
    </form>
  );
}
