import type { Validator } from '../../components/forms';
import type { Issue } from '../../components/forms/paths';
import { ApiError, isApiError } from '../../data';
import type { StringKey } from '../../i18n/strings';

type Translate = (key: StringKey) => string;

/** what the contract schemas and the API say, in English, mapped to the reader's language */
const BY_MESSAGE: Record<string, StringKey> = {
  'Use at least 10 characters': 'form.passwordShort',
  'Use international format, for example +27821234567': 'form.phoneFormat',
  'Consent is required to register': 'form.consentRequired',
  'Choose a different password': 'account.samePassword',
  'An account with this email already exists': 'form.emailTaken',
  'The current password is not correct': 'account.wrongCurrent',
};

type ZodIssue = Issue & { format?: string };

function localise(issue: ZodIssue, t: Translate): string {
  const known = BY_MESSAGE[issue.message];
  if (known) return t(known);
  if (issue.code === 'invalid_format' && issue.format === 'email') return t('form.emailFormat');
  if (issue.path.at(-1) === 'suburb') return t('register.pickSuburb');
  if (issue.code === 'too_small' && issue.minimum === 0) return t('form.number');
  return issue.message;
}

/**
 * runs `schema` on `toBody(values)` and translates the messages. issue codes are
 * kept, so an empty required field still shows the shared "Required" text
 */
export function localised<In, Out>(
  schema: { safeParse(value: unknown): ReturnType<Validator<Out>['safeParse']> },
  t: Translate,
  toBody: (values: In) => unknown = (values) => values,
): Validator<Out> {
  return {
    safeParse(values) {
      const result = schema.safeParse(toBody(values as In));
      if (result.success) return result;
      const issues = result.error.issues.map((issue) => ({
        ...issue,
        message: localise(issue as ZodIssue, t),
      }));
      return { success: false, error: { issues } };
    },
  };
}

/** server field errors arrive in English too */
export function localiseError(error: unknown, t: Translate): unknown {
  if (!isApiError(error) || Object.keys(error.fields).length === 0) return error;
  const fields = Object.fromEntries(
    Object.entries(error.fields).map(([path, message]) => {
      const known = BY_MESSAGE[message];
      return [path, known ? t(known) : message];
    }),
  );
  return new ApiError(error.code, error.message, fields);
}
