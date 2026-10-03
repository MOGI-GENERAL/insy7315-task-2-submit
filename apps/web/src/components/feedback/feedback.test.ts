import { describe, expect, test } from 'vitest';
import { ErrorCode } from '@fedsa/contract';
import { ApiError } from '../../data/ApiError';
import { dictionaries } from '../../i18n/strings';
import { errorKey } from './errorKey';
import { MAX_TOASTS, addToast, autoDismissMs, removeToast } from './toasts';
import type { Toast } from './toasts';

describe('error messages', () => {
  test('every API error code has a message in every language', () => {
    for (const code of ErrorCode.options) {
      const key = errorKey(new ApiError(code, 'server text'));
      for (const dictionary of Object.values(dictionaries)) {
        expect(dictionary[key], `${code} in ${key}`).toBeTruthy();
      }
    }
  });

  test('a failed fetch reads as no connection, and anything else as our fault', () => {
    expect(errorKey(new TypeError('Failed to fetch'))).toBe('error.network');
    expect(errorKey(new Error('boom'))).toBe('error.internal');
    expect(errorKey(new ApiError('OFFER_UNAVAILABLE', 'x'))).toBe('error.offerUnavailable');
  });
});

describe('toasts', () => {
  const toast = (id: number): Toast => ({ id, tone: 'good', message: `t${id}` });

  test('keeps the newest few and drops the oldest', () => {
    let list: Toast[] = [];
    for (let id = 1; id <= MAX_TOASTS + 2; id++) list = addToast(list, toast(id));

    expect(list).toHaveLength(MAX_TOASTS);
    expect(list.at(-1)?.id).toBe(MAX_TOASTS + 2);
    expect(removeToast(list, MAX_TOASTS + 2).map((t) => t.id)).not.toContain(MAX_TOASTS + 2);
  });

  test('errors wait to be dismissed and the rest time out', () => {
    expect(autoDismissMs('bad')).toBeNull();
    expect(autoDismissMs('good')).toBeGreaterThan(0);
    expect(autoDismissMs('info')).toBeGreaterThan(0);
  });
});

describe('dictionaries', () => {
  test('af and xh have every English key', () => {
    const keys = Object.keys(dictionaries.en).sort();
    expect(Object.keys(dictionaries.af).sort()).toEqual(keys);
    expect(Object.keys(dictionaries.xh).sort()).toEqual(keys);
  });
});
