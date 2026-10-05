import { useId } from 'react';
import { useT } from '../../i18n/useT';
import type { Range } from './useRange';

export function RangePicker({ range }: { range: Range }) {
  const t = useT();
  const id = useId();
  const invalid = range.range === null;

  return (
    <fieldset className="range-picker">
      <legend className="field__label">{t('rep.range')}</legend>
      <div className="range-picker__inputs">
        <label className="range-picker__field">
          <span className="field__label">{t('rep.from')}</span>
          <input
            className="input"
            type="date"
            value={range.from}
            max={range.to}
            aria-describedby={`${id}-hint`}
            aria-invalid={invalid}
            onChange={(e) => range.setFrom(e.target.value)}
          />
        </label>
        <label className="range-picker__field">
          <span className="field__label">{t('rep.to')}</span>
          <input
            className="input"
            type="date"
            value={range.to}
            min={range.from}
            aria-describedby={`${id}-hint`}
            aria-invalid={invalid}
            onChange={(e) => range.setTo(e.target.value)}
          />
        </label>
      </div>
      <span className="field__hint" id={`${id}-hint`}>
        {t('rep.rangeHint')}
      </span>
      {invalid && (
        <span className="field__error" role="alert">
          {t('rep.rangeInvalid')}
        </span>
      )}
    </fieldset>
  );
}
