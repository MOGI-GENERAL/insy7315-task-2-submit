import { describe, expect, test } from 'vitest';
import { LoginRequest, RegisterRequest } from '@fedsa/contract';
import { ApiError } from '../../data/ApiError';
import { REQUIRED, getPath, issuesToFields, setPath, splitSubmitError } from './paths';

describe('form paths', () => {
  test('reads and writes nested values without touching the original', () => {
    const values = { user: { email: 'a@example.org', phone: '' }, consent: false };
    const next = setPath(values, 'user.email', 'b@example.org');

    expect(getPath(next, 'user.email')).toBe('b@example.org');
    expect(getPath(values, 'user.email')).toBe('a@example.org');
    expect(next.user).not.toBe(values.user);
    expect(getPath(values, 'organisation.name')).toBeUndefined();
  });

  test('creates missing objects on the way down', () => {
    expect(setPath({}, 'organisation.name', 'Siyakhula')).toEqual({
      organisation: { name: 'Siyakhula' },
    });
  });

  test('keys contract schema issues the way the server keys its fields', () => {
    const result = RegisterRequest.safeParse({
      role: 'donor',
      consent: true,
      organisation: { name: '' },
      user: { email: 'not-an-email' },
    });
    expect(result.success).toBe(false);
    const fields = issuesToFields(result.error!.issues);

    expect(fields).toHaveProperty('user.email');
    expect(fields).toHaveProperty('organisation.name');
  });

  test('an empty required field gets the translatable marker, not zod wording', () => {
    const result = LoginRequest.safeParse({ email: '', password: '' });
    const fields = issuesToFields(result.error!.issues);
    expect(fields).toEqual({ email: REQUIRED, password: REQUIRED });
  });

  test('keeps the first message when one field fails twice', () => {
    expect(
      issuesToFields([
        { path: ['password'], message: 'first' },
        { path: ['password'], message: 'second' },
      ]),
    ).toEqual({ password: 'first' });
  });

  test('a schema that passes hands back the parsed values', () => {
    const result = LoginRequest.safeParse({ email: '  Riaan@Example.org ', password: 'x' });
    expect(result.success && result.data.email).toBe('riaan@example.org');
  });
});

describe('splitting a submit error', () => {
  test('field errors go to the fields', () => {
    const error = new ApiError('VALIDATION_FAILED', 'Some fields need attention.', {
      'user.email': 'An account with this email already exists',
    });
    expect(splitSubmitError(error)).toEqual({
      fields: { 'user.email': 'An account with this email already exists' },
      formError: null,
    });
  });

  test('an error with no fields goes above the form', () => {
    const error = new ApiError('RATE_LIMITED', 'Slow down.');
    expect(splitSubmitError(error)).toEqual({ fields: {}, formError: error });

    const offline = new TypeError('Failed to fetch');
    expect(splitSubmitError(offline).formError).toBe(offline);
  });
});
