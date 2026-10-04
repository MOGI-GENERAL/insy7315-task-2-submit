import { describe, expect, test } from 'vitest';
import { databaseHosts, parseArgs, targetRefusal } from './safety.js';

const DEPLOYED = 'mongodb+srv://seed-user@cluster0.staging.example/fedsa';
const LOCAL = 'mongodb://127.0.0.1:27017/fedsa?replicaSet=rs0';

describe('parseArgs', () => {
  test('needs a known target', () => {
    expect(parseArgs([])).toMatch(/--env=staging/);
    expect(parseArgs(['--env=production'])).toMatch(/--env=staging/);
    expect(parseArgs(['--env=demo', '--force'])).toMatch(/Unknown argument --force/);
  });

  test('reads the target and the reset flag', () => {
    expect(parseArgs(['--env=staging'])).toEqual({ env: 'staging', reset: false });
    expect(parseArgs(['--reset', '--env=demo'])).toEqual({ env: 'demo', reset: true });
  });
});

describe('databaseHosts', () => {
  test('leaves out the user name', () => {
    expect(databaseHosts(DEPLOYED)).toBe('cluster0.staging.example');
    expect(databaseHosts('mongodb://a:27017,b:27017/fedsa')).toBe('a:27017,b:27017');
    expect(databaseHosts('postgres://localhost/fedsa')).toBeNull();
  });
});

describe('targetRefusal', () => {
  test('test only writes to a database on this machine', () => {
    expect(targetRefusal('test', LOCAL, undefined)).toBeNull();
    expect(targetRefusal('test', 'mongodb://mongo:27017/fedsa', undefined)).toBeNull();
    expect(targetRefusal('test', 'mongodb://[::1]:27017/fedsa', undefined)).toBeNull();
    expect(targetRefusal('test', DEPLOYED, 'cluster0.staging.example')).toMatch(/not one/);
    expect(targetRefusal('test', 'mongodb://localhost,db.example.org/fedsa', undefined)).toMatch(
      /not one/,
    );
  });

  test('staging and demo need the host confirmed', () => {
    for (const env of ['staging', 'demo'] as const) {
      expect(targetRefusal(env, DEPLOYED, undefined)).toMatch(
        /SEED_CONFIRM_HOST=cluster0\.staging\.example/,
      );
      expect(targetRefusal(env, DEPLOYED, 'cluster0.production.example')).not.toBeNull();
      expect(targetRefusal(env, DEPLOYED, 'cluster0.staging.example')).toBeNull();
    }
  });

  test('a refusal never repeats the user name', () => {
    expect(targetRefusal('test', DEPLOYED, undefined)).not.toMatch(/seed-user/);
    expect(targetRefusal('staging', DEPLOYED, undefined)).not.toMatch(/seed-user/);
  });

  test('refuses something that is not a connection string', () => {
    expect(targetRefusal('test', 'localhost', undefined)).toMatch(/not a MongoDB/);
  });
});
