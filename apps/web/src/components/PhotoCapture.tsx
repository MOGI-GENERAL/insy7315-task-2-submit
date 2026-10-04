import { useEffect, useId, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useT } from '../i18n/useT';
import { resizeImage } from '../lib/resizeImage';
import { Icon } from './Icon';

/** opens the rear camera on a phone and the file picker elsewhere */
export function PhotoCapture({
  files,
  onChange,
  max,
  label,
  hint,
  error,
}: {
  files: readonly File[];
  onChange: (files: File[]) => void;
  max: number;
  label: string;
  hint?: string;
  error?: string;
}) {
  const t = useT();
  const id = useId();
  const [resizing, setResizing] = useState(false);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);

  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  async function add(e: ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(e.target.files ?? []).slice(0, max - files.length);
    e.target.value = '';
    if (chosen.length === 0) return;
    setResizing(true);
    try {
      onChange([...files, ...(await Promise.all(chosen.map((f) => resizeImage(f))))]);
    } finally {
      setResizing(false);
    }
  }

  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ');

  return (
    <fieldset className="photo-picker">
      <legend className="field__label">
        <Icon name="camera" size={16} /> {label}
      </legend>
      {hint && (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}

      {files.length > 0 && (
        <ul className="photo-picker__grid photo-capture__list">
          {files.map((file, i) => (
            <li key={previews[i]} className="photo-picker__frame">
              <img src={previews[i]} alt={t('photo.preview')} className="foodphoto foodphoto--img" />
              <button
                type="button"
                className="btn btn--ghost photo-capture__remove"
                onClick={() => onChange(files.filter((f) => f !== file))}
              >
                <Icon name="close" size={16} />
                {t('photo.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}

      {files.length < max && (
        <label className="btn btn--secondary photo-capture__add">
          {resizing ? (
            <span className="spinner spinner--sm" aria-hidden="true" />
          ) : (
            <Icon name="camera" size={18} />
          )}
          {files.length === 0 ? t('photo.take') : t('photo.another')}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple={max - files.length > 1}
            className="sr-only"
            onChange={(e) => void add(e)}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy || undefined}
          />
        </label>
      )}

      {error && (
        <span className="field__error" id={`${id}-error`}>
          {error}
        </span>
      )}
    </fieldset>
  );
}
