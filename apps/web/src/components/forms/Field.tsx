import type { ReactNode } from 'react';
import { useT } from '../../i18n/useT';
import { errorKey } from '../feedback/errorKey';
import { Icon } from '../Icon';
import { REQUIRED } from './paths';
import type { AnyForm } from './useForm';

type InputProps = ReturnType<AnyForm['input']>;

function useFieldError(form: AnyForm, name: string): string | undefined {
  const t = useT();
  const error = form.error(name);
  return error === REQUIRED ? t('common.required') : error;
}

/** label, hint and error around one control. `children` spreads the props onto it */
export function Field({
  form,
  name,
  label,
  hint,
  optional = false,
  kind,
  children,
}: {
  form: AnyForm;
  name: string;
  label: string;
  hint?: string;
  optional?: boolean;
  kind?: 'text' | 'number';
  children: (props: InputProps) => ReactNode;
}) {
  const t = useT();
  const ids = form.ids(name);
  const error = useFieldError(form, name);

  return (
    <div className="field">
      <label className="field__label" htmlFor={ids.input}>
        {label}
        {optional && <span className="field__optional"> ({t('common.optional')})</span>}
      </label>
      {children(form.input(name, { kind, hint: Boolean(hint) }))}
      {hint && (
        <span className="field__hint" id={ids.hint}>
          {hint}
        </span>
      )}
      {error && (
        <span className="field__error" id={ids.error}>
          {error}
        </span>
      )}
    </div>
  );
}

export function Checkbox({
  form,
  name,
  label,
  hint,
}: {
  form: AnyForm;
  name: string;
  label: ReactNode;
  hint?: string;
}) {
  const ids = form.ids(name);
  const error = useFieldError(form, name);

  return (
    <div className="field">
      <label className="choice">
        <input {...form.checkbox(name, { hint: Boolean(hint) })} />
        <span>{label}</span>
      </label>
      {hint && (
        <span className="field__hint" id={ids.hint}>
          {hint}
        </span>
      )}
      {error && (
        <span className="field__error" id={ids.error}>
          {error}
        </span>
      )}
    </div>
  );
}

/** the rejection that belongs to no single field, read out when it appears */
export function FormError({ form }: { form: AnyForm }) {
  const t = useT();
  const { formError } = form;
  if (!formError) return null;
  return (
    <div className="banner" data-tone="bad" role="alert">
      <Icon name="alert" size={20} />
      <div className="banner__body">{t(errorKey(formError))}</div>
    </div>
  );
}
