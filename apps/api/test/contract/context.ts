import { request as httpRequest } from 'node:http';
import type { ErrorCode } from '@fedsa/contract';
import {
  ClaimModel,
  NotificationModel,
  OfferModel,
  OrganisationModel,
  UserModel,
} from '../../src/db/index.js';
import { seedPeriod } from '../../src/seed/records.js';
import { DONORS, MARIUS, NADIA, RECIPIENTS, ZANELE, type Person } from '../../src/seed/scenario.js';
import type { TestClient } from '../test-client.js';
import { anonymousClient, signedInClient } from '../integration/test-app.js';

/** only ever used against the in-memory database */
export const SEED_PASSWORD = 'seed accounts in contract tests';

/** a valid id that no seeded record has */
export const UNKNOWN_ID = '0'.repeat(24);

const PEOPLE = new Map<string, Person>(
  [...DONORS, ...RECIPIENTS]
    .map((o) => o.person)
    .concat([NADIA, ZANELE, MARIUS])
    .map((p) => [p.key, p]),
);

/** a seeded person's key, such as `riaan` or `nadia`, or `anonymous` */
export type Caller = string;

export function personFor(key: string) {
  const person = PEOPLE.get(key);
  if (!person) throw new Error(`no seeded person has the key ${key}`);
  return person;
}

type Send = (t: ContractContext) => Promise<Response>;

/** a case only says how to call the route. the status and body to expect come from the routes table */
export interface ContractCase {
  success: Send;
  error: { code: ErrorCode; send: Send };
}

/** what a case can use. lookups query the database on every call */
export class ContractContext {
  readonly baseUrl: string;
  /** an app started without a push key */
  readonly pushOffBaseUrl: string;
  /** the six weeks of seeded history, as report query values */
  readonly period: { from: string; to: string };
  private readonly sessions = new Map<string, Promise<TestClient>>();

  constructor(baseUrl: string, pushOffBaseUrl: string, seededAt: Date) {
    this.baseUrl = baseUrl;
    this.pushOffBaseUrl = pushOffBaseUrl;
    this.period = seedPeriod(seededAt);
  }

  /**
   * one session per person for every case that leaves the session as it is.
   * an anonymous caller gets a new client each time, because a case may sign it in
   */
  client(caller: Caller): Promise<TestClient> {
    if (caller === 'anonymous') return anonymousClient(this.baseUrl);
    let session = this.sessions.get(caller);
    if (!session) {
      session = this.newSession(caller);
      this.sessions.set(caller, session);
    }
    return session;
  }

  /** for a case that signs out or would otherwise spoil a shared session */
  newSession(caller: Caller) {
    return signedInClient(this.baseUrl, personFor(caller).email, SEED_PASSWORD);
  }

  async request(caller: Caller, method: string, path: string, body?: unknown) {
    return (await this.client(caller)).request(method, path, body);
  }

  async offerId(title: string) {
    const offers = await OfferModel.find({ title });
    if (offers.length !== 1) throw new Error(`${offers.length} seeded offers are titled ${title}`);
    return offers[0]!._id.toHexString();
  }

  async organisationId(name: string) {
    const organisation = await OrganisationModel.findOne({ name });
    if (!organisation) throw new Error(`no seeded organisation is called ${name}`);
    return organisation._id.toHexString();
  }

  /** the latest claim on the offer with this title */
  async claimId(offerTitle: string) {
    const claim = await ClaimModel.findOne({ offerId: await this.offerId(offerTitle) }).sort({
      claimedAt: -1,
    });
    if (!claim) throw new Error(`no claim on ${offerTitle}`);
    return claim._id.toHexString();
  }

  async notificationId(caller: Caller) {
    const user = await UserModel.findOne({ email: personFor(caller).email });
    const notification = await NotificationModel.findOne({ userId: user?._id });
    if (!notification) throw new Error(`${caller} has no notifications`);
    return notification._id.toHexString();
  }

  /**
   * fetch refuses a body on GET. without a length, Node's own parser rejects
   * the request before Express sees it
   */
  malformedJson(method: string, path: string): Promise<Response> {
    const body = '{"not json';
    return new Promise((resolve, reject) => {
      const req = httpRequest(
        `${this.baseUrl}${path}`,
        {
          method,
          headers: { 'content-type': 'application/json', 'content-length': body.length },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () =>
            resolve(new Response(Buffer.concat(chunks), { status: res.statusCode })),
          );
          res.on('error', reject);
        },
      );
      req.on('error', reject);
      req.end(body);
    });
  }
}
