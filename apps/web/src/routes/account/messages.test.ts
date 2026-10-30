import { describe, expect, test } from 'vitest';
import { DispatchRequest } from '@fedsa/contract';
import { en } from '../../i18n/strings';
import type { StringKey } from '../../i18n/strings';
import { localised } from './messages';

const t = (key: StringKey) => en[key];

describe('localised schema messages', () => {
  test('a short string reads as plain words, not zod wording', () => {
    const result = localised(DispatchRequest, t).safeParse({
      driverName: 'F',
      driverPhone: '+27000000031',
      scheduledFor: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.message).toBe('Use at least 2 characters.');
  });
});
