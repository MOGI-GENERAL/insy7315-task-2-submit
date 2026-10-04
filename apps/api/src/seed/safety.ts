export const SEED_ENVS = ['staging', 'demo', 'test'] as const;
export type SeedEnv = (typeof SEED_ENVS)[number];

export interface SeedArgs {
  env: SeedEnv;
  reset: boolean;
}

export const USAGE = 'Usage: npm run seed -w apps/api -- --env=staging|demo|test [--reset]';

/** `mongo` is the database container in the local Docker setup */
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', 'mongo'];

/** a message in place of the arguments when the command line is wrong */
export function parseArgs(argv: string[]): SeedArgs | string {
  let env: string | undefined;
  let reset = false;
  for (const arg of argv) {
    if (arg.startsWith('--env=')) env = arg.slice('--env='.length);
    else if (arg === '--reset') reset = true;
    else return `Unknown argument ${arg}. ${USAGE}`;
  }
  const known = SEED_ENVS.find((name) => name === env);
  if (!known) return `Name the target with --env=staging, --env=demo or --env=test. ${USAGE}`;
  return { env: known, reset };
}

/** the host list of a connection string, without the user name or password */
export function databaseHosts(uri: string): string | null {
  const match = /^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)/.exec(uri);
  return match ? match[1]! : null;
}

function isLocal(hosts: string) {
  return hosts.split(',').every((host) => {
    const name = host.replace(/:\d+$/, '').replace(/^\[(.*)\]$/, '$1');
    return LOCAL_HOSTS.includes(name);
  });
}

/** null when the seed may write to this database, otherwise the reason for refusing */
export function targetRefusal(
  env: SeedEnv,
  uri: string,
  confirmedHosts: string | undefined,
): string | null {
  const hosts = databaseHosts(uri);
  if (!hosts) return 'MONGODB_URI is not a MongoDB connection string';

  if (env === 'test') {
    if (isLocal(hosts)) return null;
    return `--env=test only seeds a database on this machine, and ${hosts} is not one`;
  }
  if (confirmedHosts !== hosts) {
    return `--env=${env} would write to ${hosts}. If that is the database you mean, set SEED_CONFIRM_HOST=${hosts} for this run`;
  }
  return null;
}
