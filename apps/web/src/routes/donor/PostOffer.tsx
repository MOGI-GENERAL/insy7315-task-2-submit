import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MAX_PHOTOS_PER_OFFER,
  PostOfferFields,
  type ColdChain,
  type FoodCategory,
} from '@fedsa/contract';
import { useSession } from '../../auth/context';
import { useData } from '../../data';
import { PendingButton } from '../../components/feedback';
import { Field, FormError, useForm } from '../../components/forms';
import type { Validator } from '../../components/forms';
import { Icon } from '../../components/Icon';
import { PhotoCapture } from '../../components/PhotoCapture';
import { PageHead } from '../../components/ui';
import { useT, categoryKey, coldChainKey } from '../../i18n/useT';
import { mealsFromKg } from '../../lib/format';
import { newRequestKey } from '../../lib/requestKey';
import './PostOffer.css';

const categories: FoodCategory[] = ['bakery', 'produce', 'dairy', 'prepared', 'dry', 'other'];
const coldChains: ColdChain[] = ['ambient', 'refrigerated', 'frozen'];

interface Values {
  title: string;
  offeredQuantityKg: number | undefined;
  category: FoodCategory;
  coldChain: ColdChain;
  /** `datetime-local` values, in the phone's time zone */
  availableFrom: string;
  collectionDeadline: string;
  description: string;
}

function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const inMinutes = (mins: number) => toLocalInput(new Date(Date.now() + mins * 60_000));

function tomorrowAt(hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  return toLocalInput(d);
}

/** an unparseable value goes through as it is, for the schema to report against the field */
function toIso(local: string): string {
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? local : date.toISOString();
}

const fieldsSchema: Validator<PostOfferFields> = {
  safeParse: (v) => {
    const values = v as Values;
    return PostOfferFields.safeParse({
      title: values.title,
      offeredQuantityKg: values.offeredQuantityKg,
      category: values.category,
      coldChain: values.coldChain,
      availableFrom: values.availableFrom ? toIso(values.availableFrom) : undefined,
      collectionDeadline: toIso(values.collectionDeadline),
      description: values.description.trim() || undefined,
    });
  },
};

export function PostOffer() {
  const { organisation } = useSession();
  const { offers } = useData();
  const navigate = useNavigate();
  const t = useT();
  const [photos, setPhotos] = useState<File[]>([]);
  // one key for the life of the form. a retry after a dropped connection then posts once
  const [requestKey] = useState(newRequestKey);

  const [times] = useState(() => [inMinutes(60), inMinutes(90), inMinutes(180), tomorrowAt(17)]);
  const presets = [
    { label: t('post.in1h'), value: times[0] },
    { label: t('post.in90m'), value: times[1] },
    { label: t('post.in3h'), value: times[2] },
    { label: t('post.tomorrow17'), value: times[3] },
  ];

  const form = useForm<Values, PostOfferFields>({
    initial: {
      title: '',
      offeredQuantityKg: undefined,
      category: 'bakery',
      coldChain: 'ambient',
      availableFrom: toLocalInput(new Date()),
      collectionDeadline: presets[1].value,
      description: '',
    },
    schema: fieldsSchema,
    onSubmit: async (fields) => {
      const posted = await offers.post(fields, photos, requestKey);
      navigate('/donor/posted', { state: posted, replace: true });
    },
  });

  const { category, coldChain, collectionDeadline, offeredQuantityKg } = form.values;

  function chooseCategory(c: FoodCategory) {
    form.set('category', c);
    if (c === 'dairy' || c === 'prepared') form.set('coldChain', 'refrigerated');
    if (c === 'bakery' || c === 'dry') form.set('coldChain', 'ambient');
  }

  return (
    <form className="post-form" {...form.formProps}>
      <PageHead
        title={t('post.title')}
        lead={organisation ? `${organisation.name}, ${organisation.suburb}` : undefined}
      />

      <FormError form={form} />

      <Field form={form} name="title" label={t('post.whatIsIt')} hint={t('post.titleHelp')}>
        {(props) => (
          <input {...props} className="input" placeholder={t('post.titleHint')} autoComplete="off" />
        )}
      </Field>

      <Field
        form={form}
        name="offeredQuantityKg"
        kind="number"
        label={t('post.howMuch')}
        hint={
          offeredQuantityKg && offeredQuantityKg > 0
            ? `${t('post.about')} ${mealsFromKg(offeredQuantityKg).toLocaleString('en-ZA')} ${t('offer.meals')}`
            : t('post.estimateFine')
        }
      >
        {(props) => (
          <div className="qty">
            <input {...props} className="input" type="number" inputMode="decimal" min="0.1" />
            <span className="qty__unit">kg</span>
          </div>
        )}
      </Field>

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
                onChange={() => chooseCategory(c)}
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
                name="coldChain"
                value={c}
                checked={coldChain === c}
                onChange={() => form.set('coldChain', c)}
              />
              <span>{t(coldChainKey(c))}</span>
            </label>
          ))}
        </div>
        <span className="field__hint">{t('post.storageWhy')}</span>
      </fieldset>

      <fieldset className="field">
        <legend className="field__label">{t('post.collectBy')}</legend>
        <div className="choices">
          {presets.map((preset) => (
            <label key={preset.label} className="choice">
              <input
                type="radio"
                name="deadline-preset"
                checked={collectionDeadline === preset.value}
                onChange={() => form.set('collectionDeadline', preset.value)}
              />
              <span>{preset.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field form={form} name="collectionDeadline" label={t('post.exactTime')}>
        {(props) => <input {...props} className="input" type="datetime-local" />}
      </Field>

      <details className="post-form__more">
        <summary>{t('post.moreOptions')}</summary>

        <Field
          form={form}
          name="availableFrom"
          label={t('post.availableFrom')}
          hint={t('post.availableFromHint')}
        >
          {(props) => <input {...props} className="input" type="datetime-local" />}
        </Field>

        <Field form={form} name="description" label={t('post.notes')} optional>
          {(props) => (
            <textarea {...props} className="textarea" placeholder={t('post.notesHint')} />
          )}
        </Field>
      </details>

      <PhotoCapture
        files={photos}
        onChange={setPhotos}
        max={MAX_PHOTOS_PER_OFFER}
        label={t('post.addPhoto')}
        hint={t('post.photoWhy')}
        error={form.error('photos')}
      />

      <div className="post-form__reach">
        <Icon name="people" size={20} />
        <span>{t('post.reach')}</span>
      </div>

      <PendingButton
        type="submit"
        className="btn btn--primary btn--lg btn--block"
        pending={form.pending}
        pendingLabel={t('post.posting')}
      >
        <Icon name="check" size={20} />
        {t('post.submit')}
      </PendingButton>
    </form>
  );
}
