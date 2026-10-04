import { isApiError } from '../../data/ApiError';

export type FieldErrors = Record<string, string>;

/** reads `user.email` out of `{ user: { email } }` */
export function getPath(values: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (node, key) =>
        node !== null && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined,
      values,
    );
}

/** copies every object along the path. React compares state by reference */
export function setPath<T>(values: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split('.');
  const node = (values ?? {}) as Record<string, unknown>;
  return {
    ...node,
    [head]: rest.length === 0 ? value : setPath(node[head], rest.join('.'), value),
  } as T;
}

export interface Issue {
  path: ReadonlyArray<PropertyKey>;
  message: string;
  code?: string;
  minimum?: unknown;
}

/** stands for an empty required field. `Field` shows it in the user's language */
export const REQUIRED = '\u0000required';

/** zod's own wording for these is English and technical */
const isRequired = (issue: Issue) =>
  issue.code === 'invalid_type' || (issue.code === 'too_small' && issue.minimum === 1);

/** first message per field, under the dotted key the server uses in `fields` */
export function issuesToFields(issues: ReadonlyArray<Issue>): FieldErrors {
  const fields: FieldErrors = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join('.');
    fields[key] ??= isRequired(issue) ? REQUIRED : issue.message;
  }
  return fields;
}

/** a rejection with field errors goes next to the inputs. anything else goes above the form */
export function splitSubmitError(error: unknown): { fields: FieldErrors; formError: unknown } {
  if (isApiError(error) && Object.keys(error.fields).length > 0) {
    return { fields: error.fields, formError: null };
  }
  return { fields: {}, formError: error };
}
