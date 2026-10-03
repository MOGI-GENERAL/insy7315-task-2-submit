import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, RefObject } from 'react';
import { getPath, issuesToFields, setPath, splitSubmitError } from './paths';
import type { FieldErrors, Issue } from './paths';

/** any zod schema from `@fedsa/contract` fits */
export interface Validator<Out> {
  safeParse(
    value: unknown,
  ): { success: true; data: Out } | { success: false; error: { issues: ReadonlyArray<Issue> } };
}

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export interface FieldIds {
  input: string;
  hint: string;
  error: string;
}

export interface Form<V> {
  values: V;
  set(name: string, value: unknown): void;
  error(name: string): string | undefined;
  /** a rejection with no field errors, for `<FormError>` */
  formError: unknown;
  pending: boolean;
  ids(name: string): FieldIds;
  /** text, select and textarea. `number` turns an empty box into undefined */
  input(
    name: string,
    options?: { kind?: 'text' | 'number'; hint?: boolean },
  ): {
    id: string;
    name: string;
    value: string | number;
    onChange: (e: ChangeEvent<Control>) => void;
    'aria-invalid': boolean;
    'aria-describedby': string | undefined;
  };
  checkbox(
    name: string,
    options?: { hint?: boolean },
  ): {
    id: string;
    name: string;
    type: 'checkbox';
    checked: boolean;
    onChange: (e: ChangeEvent<HTMLInputElement>) => void;
    'aria-invalid': boolean;
    'aria-describedby': string | undefined;
  };
  formProps: {
    ref: RefObject<HTMLFormElement | null>;
    onSubmit: (e: FormEvent<HTMLFormElement>) => void;
    noValidate: true;
  };
  reset(values?: V): void;
}

/** what `Field` and friends need, whatever the form's values */
export type AnyForm = Pick<Form<unknown>, 'ids' | 'error' | 'input' | 'checkbox' | 'formError'>;

/**
 * field names are dotted paths into `values`, the same keys a server `fields` map uses.
 * with a `schema`, `onSubmit` gets the parsed values and only runs when they pass
 */
export function useForm<V extends object, Out = V>({
  initial,
  schema,
  onSubmit,
}: {
  initial: V;
  schema?: Validator<Out>;
  onSubmit: (values: Out) => unknown;
}): Form<V> {
  const prefix = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<V>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [failedAttempt, setFailedAttempt] = useState(0);

  useEffect(() => {
    if (failedAttempt === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [failedAttempt]);

  const set = useCallback((name: string, value: unknown) => {
    setValues((v) => setPath(v, name, value));
    setErrors((e) => {
      if (!(name in e)) return e;
      const rest = { ...e };
      delete rest[name];
      return rest;
    });
  }, []);

  const ids = (name: string): FieldIds => {
    const base = `${prefix}-${name.replaceAll('.', '-')}`;
    return { input: base, hint: `${base}-hint`, error: `${base}-error` };
  };

  const describedBy = (name: string, hint?: boolean) => {
    const { hint: hintId, error: errorId } = ids(name);
    const list = [hint && hintId, errors[name] && errorId].filter(Boolean);
    return list.length ? list.join(' ') : undefined;
  };

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;

    let parsed = values as unknown as Out;
    if (schema) {
      const result = schema.safeParse(values);
      if (!result.success) {
        setErrors(issuesToFields(result.error.issues));
        setFormError(null);
        setFailedAttempt((n) => n + 1);
        return;
      }
      parsed = result.data;
    }

    setPending(true);
    setFormError(null);
    try {
      await onSubmit(parsed);
    } catch (error) {
      const split = splitSubmitError(error);
      setErrors(split.fields);
      setFormError(split.formError);
      setFailedAttempt((n) => n + 1);
    } finally {
      setPending(false);
    }
  }

  return {
    values,
    set,
    error: (name) => errors[name],
    formError,
    pending,
    ids,
    input(name, { kind = 'text', hint } = {}) {
      const value = getPath(values, name);
      return {
        id: ids(name).input,
        name,
        value: value === undefined || value === null ? '' : (value as string | number),
        onChange: (e) => {
          const raw = e.target.value;
          set(name, kind === 'number' ? (raw === '' ? undefined : Number(raw)) : raw);
        },
        'aria-invalid': Boolean(errors[name]),
        'aria-describedby': describedBy(name, hint),
      };
    },
    checkbox(name, { hint } = {}) {
      return {
        id: ids(name).input,
        name,
        type: 'checkbox',
        checked: getPath(values, name) === true,
        onChange: (e) => set(name, e.target.checked),
        'aria-invalid': Boolean(errors[name]),
        'aria-describedby': describedBy(name, hint),
      };
    },
    formProps: { ref: formRef, onSubmit: (e) => void submit(e), noValidate: true },
    reset(next = initial) {
      setValues(next);
      setErrors({});
      setFormError(null);
    },
  };
}
