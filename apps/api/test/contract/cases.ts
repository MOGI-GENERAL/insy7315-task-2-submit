import { randomBytes } from 'node:crypto';
import type {
  ClaimResponse,
  CollectionResponse,
  CreateUserResponse,
  PostOfferResponse,
  RouteKey,
} from '@fedsa/contract';
import { HandoverRecordModel } from '../../src/db/index.js';
import { TestClient } from '../test-client.js';
import { donorRegistration } from '../integration/test-app.js';
import {
  SEED_PASSWORD,
  UNKNOWN_ID,
  personFor,
  type ContractCase,
  type ContractContext,
} from './context.js';

/** the smallest file that passes the JPEG magic-byte check */
const JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
]);

function offerForm(photo: Buffer, title = 'End of day bake') {
  const form = new FormData();
  form.append('title', title);
  form.append('category', 'bakery');
  form.append('offeredQuantityKg', '31');
  form.append('coldChain', 'ambient');
  form.append('collectionDeadline', new Date(Date.now() + 3 * 3_600_000).toISOString());
  form.append('photos', new Blob([new Uint8Array(photo)], { type: 'image/jpeg' }), 'bread.jpg');
  return form;
}

function donorConfirmForm(kg: number) {
  const form = new FormData();
  form.append('collectedQuantityKg', String(kg));
  form.append('photo', new Blob([new Uint8Array(JPEG)], { type: 'image/jpeg' }), 'handover.jpg');
  return form;
}

const DAIRY = 'Chilled dairy, short date';

async function claimDairy(t: ContractContext) {
  const offerId = await t.offerId(DAIRY);
  // a repeat by the same organisation answers with its claim. safe after the claim case
  await t.request('peter', 'POST', `/api/offers/${offerId}/claim`, { transportNeeded: false });
  return offerId;
}

/** the dairy handover. Kaap Foods confirms it with a photo the first time it is asked for */
async function dairyHandover(t: ContractContext) {
  const offerId = await claimDairy(t);
  if (!(await HandoverRecordModel.exists({ offerId }))) {
    await t.request(
      'nomsa',
      'POST',
      `/api/offers/${offerId}/handover/donor-confirm`,
      donorConfirmForm(45),
    );
  }
  return t.handoverId(DAIRY);
}

const subscription = {
  endpoint: 'https://push.example/subscriptions/contract',
  keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
};

async function postOffer(t: ContractContext, photo: Buffer) {
  return (await t.client('riaan')).request('POST', '/api/offers', offerForm(photo));
}

let driverJobs = 0;

/** a new offer that Athlone Haven claims with transport, for a case that has to dispatch it */
async function transportClaim(t: ContractContext) {
  driverJobs += 1;
  const posted = await (
    await t.client('riaan')
  ).request('POST', '/api/offers', offerForm(JPEG, `Loaves needing a driver ${driverJobs}`));
  const { offer } = (await posted.json()) as PostOfferResponse;
  const claimed = await t.request('gadija', 'POST', `/api/offers/${offer.id}/claim`, {
    transportNeeded: true,
  });
  if (claimed.status !== 201) throw new Error(`claiming for dispatch gave ${claimed.status}`);
  return ((await claimed.json()) as ClaimResponse).claim.id;
}

const newToken = () => randomBytes(32).toString('base64url');

const driver = () => ({
  driverName: 'Themba Mokoena',
  driverPhone: '+27821112222',
  scheduledFor: new Date(Date.now() + 3_600_000).toISOString(),
});

/**
 * one entry per route the app serves. the success call must get the route's
 * status from the routes table, and the error call the status of its code
 */
export const CONTRACT_CASES: Partial<Record<RouteKey, ContractCase>> = {
  'GET /api/openapi.json': {
    success: (t) => t.request('anonymous', 'GET', '/api/openapi.json'),
    error: { code: 'VALIDATION_FAILED', send: (t) => t.malformedJson('GET', '/api/openapi.json') },
  },
  'GET /api/health': {
    success: (t) => t.request('anonymous', 'GET', '/api/health'),
    error: { code: 'VALIDATION_FAILED', send: (t) => t.malformedJson('GET', '/api/health') },
  },
  'GET /api/auth/csrf': {
    success: async (t) => new TestClient(t.baseUrl).get('/api/auth/csrf'),
    error: { code: 'VALIDATION_FAILED', send: (t) => t.malformedJson('GET', '/api/auth/csrf') },
  },
  'POST /api/auth/register': {
    success: (t) => t.request('anonymous', 'POST', '/api/auth/register', donorRegistration()),
    error: {
      code: 'VALIDATION_FAILED',
      send: (t) =>
        t.request(
          'anonymous',
          'POST',
          '/api/auth/register',
          donorRegistration(personFor('riaan').email),
        ),
    },
  },
  'POST /api/auth/login': {
    success: (t) =>
      t.request('anonymous', 'POST', '/api/auth/login', {
        email: personFor('nosipho').email,
        password: SEED_PASSWORD,
      }),
    error: {
      code: 'UNAUTHENTICATED',
      send: (t) =>
        t.request('anonymous', 'POST', '/api/auth/login', {
          email: personFor('nosipho').email,
          password: 'not the password',
        }),
    },
  },
  'POST /api/auth/logout': {
    success: async (t) => (await t.newSession('thandi')).post('/api/auth/logout'),
    error: {
      code: 'UNAUTHENTICATED',
      send: (t) => t.request('anonymous', 'POST', '/api/auth/logout'),
    },
  },
  'GET /api/me': {
    success: (t) => t.request('riaan', 'GET', '/api/me'),
    error: { code: 'UNAUTHENTICATED', send: (t) => t.request('anonymous', 'GET', '/api/me') },
  },
  'PATCH /api/me': {
    success: (t) => t.request('peter', 'PATCH', '/api/me', { languagePreference: 'af' }),
    error: {
      code: 'VALIDATION_FAILED',
      send: (t) => t.request('peter', 'PATCH', '/api/me', { phone: '0821234567' }),
    },
  },
  'POST /api/me/password': {
    success: async (t) =>
      (await t.newSession('riedwaan')).post('/api/me/password', {
        currentPassword: SEED_PASSWORD,
        newPassword: 'a different long password',
      }),
    error: {
      code: 'VALIDATION_FAILED',
      send: (t) =>
        t.request('peter', 'POST', '/api/me/password', {
          currentPassword: 'not the password',
          newPassword: 'a different long password',
        }),
    },
  },
  'POST /api/me/push-subscriptions': {
    success: (t) => t.request('nosipho', 'POST', '/api/me/push-subscriptions', subscription),
    error: {
      code: 'VALIDATION_FAILED',
      send: (t) =>
        t.request('nosipho', 'POST', '/api/me/push-subscriptions', {
          ...subscription,
          endpoint: 'not a url',
        }),
    },
  },
  'DELETE /api/me/push-subscriptions': {
    success: (t) =>
      t.request('nosipho', 'DELETE', '/api/me/push-subscriptions', {
        endpoint: subscription.endpoint,
      }),
    error: {
      code: 'VALIDATION_FAILED',
      send: (t) => t.request('nosipho', 'DELETE', '/api/me/push-subscriptions', {}),
    },
  },
  'GET /api/push/public-key': {
    success: (t) => t.request('anonymous', 'GET', '/api/push/public-key'),
    error: {
      code: 'NOT_FOUND',
      send: async (t) => new TestClient(t.pushOffBaseUrl).get('/api/push/public-key'),
    },
  },

  'GET /api/organisations/me': {
    success: (t) => t.request('nosipho', 'GET', '/api/organisations/me'),
    error: { code: 'FORBIDDEN', send: (t) => t.request('nadia', 'GET', '/api/organisations/me') },
  },
  'PATCH /api/organisations/me': {
    success: (t) =>
      t.request('nomsa', 'PATCH', '/api/organisations/me', { taxReferenceNumber: '9001234567' }),
    error: {
      code: 'VALIDATION_FAILED',
      send: (t) => t.request('nomsa', 'PATCH', '/api/organisations/me', { maxCapacityKg: 100 }),
    },
  },
  'GET /api/organisations': {
    success: (t) => t.request('nadia', 'GET', '/api/organisations?type=recipient'),
    error: {
      code: 'VALIDATION_FAILED',
      send: (t) => t.request('nadia', 'GET', '/api/organisations?status=closed'),
    },
  },
  'GET /api/organisations/:id': {
    success: async (t) =>
      t.request('zanele', 'GET', `/api/organisations/${await t.organisationId("Ouma's Bakery")}`),
    error: {
      code: 'NOT_FOUND',
      send: (t) => t.request('zanele', 'GET', `/api/organisations/${UNKNOWN_ID}`),
    },
  },
  'POST /api/organisations/:id/verification': {
    success: async (t) =>
      t.request(
        'nadia',
        'POST',
        `/api/organisations/${await t.organisationId('Hope Kitchen')}/verification`,
        {
          decision: 'verify',
        },
      ),
    error: {
      code: 'INVALID_STATE',
      send: async (t) =>
        t.request(
          'nadia',
          'POST',
          `/api/organisations/${await t.organisationId("Ouma's Bakery")}/verification`,
          {
            decision: 'verify',
          },
        ),
    },
  },
  'PUT /api/organisations/:id/notes': {
    success: async (t) =>
      t.request(
        'nadia',
        'PUT',
        `/api/organisations/${await t.organisationId('Athlone Haven')}/notes`,
        {
          capacityNotes: 'Fridge and a large dry store. No vehicle.',
        },
      ),
    error: {
      code: 'VALIDATION_FAILED',
      send: async (t) =>
        t.request(
          'nadia',
          'PUT',
          `/api/organisations/${await t.organisationId('Athlone Haven')}/notes`,
          {},
        ),
    },
  },

  'POST /api/offers': {
    success: (t) => postOffer(t, JPEG),
    error: {
      code: 'UPLOAD_REJECTED',
      send: (t) => postOffer(t, Buffer.from('a shopping list, not a photo')),
    },
  },
  'GET /api/offers': {
    success: (t) => t.request('nomsa', 'GET', '/api/offers?view=mine'),
    error: { code: 'FORBIDDEN', send: (t) => t.request('nomsa', 'GET', '/api/offers?view=feed') },
  },
  'GET /api/offers/:id': {
    success: async (t) =>
      t.request('nadia', 'GET', `/api/offers/${await t.offerId('Tomatoes and leafy greens')}`),
    error: {
      code: 'NOT_FOUND',
      send: async (t) =>
        t.request('riaan', 'GET', `/api/offers/${await t.offerId('Tomatoes and leafy greens')}`),
    },
  },
  'POST /api/offers/:id/cancel': {
    success: async (t) =>
      t.request(
        'shireen',
        'POST',
        `/api/offers/${await t.offerId('Prepared meals, lunch service')}/cancel`,
        {
          reason: 'Sold out at lunch',
        },
      ),
    error: {
      code: 'INVALID_STATE',
      send: async (t) =>
        t.request(
          'dean',
          'POST',
          `/api/offers/${await t.offerId('Function surplus, cold platters')}/cancel`,
          {},
        ),
    },
  },
  'POST /api/offers/:id/claim': {
    success: async (t) =>
      t.request(
        'peter',
        'POST',
        `/api/offers/${await t.offerId('Chilled dairy, short date')}/claim`,
        {
          transportNeeded: false,
        },
      ),
    error: {
      code: 'OFFER_UNAVAILABLE',
      send: async (t) =>
        t.request(
          'thandi',
          'POST',
          `/api/offers/${await t.offerId('Function surplus, cold platters')}/claim`,
          {
            transportNeeded: false,
          },
        ),
    },
  },
  'GET /api/claims': {
    success: (t) => t.request('nosipho', 'GET', '/api/claims'),
    error: {
      code: 'VALIDATION_FAILED',
      send: (t) => t.request('nosipho', 'GET', '/api/claims?status=lost'),
    },
  },
  'POST /api/claims/:id/release': {
    success: async (t) =>
      t.request('nosipho', 'POST', `/api/claims/${await t.claimId('Bread, 30 loaves')}/release`, {
        reason: 'Our driver is out on another run',
      }),
    error: {
      code: 'INVALID_STATE',
      send: async (t) =>
        t.request(
          'peter',
          'POST',
          `/api/claims/${await t.claimId('Function surplus, cold platters')}/release`,
          {},
        ),
    },
  },

  'POST /api/offers/:id/handover/donor-confirm': {
    success: async (t) =>
      t.request(
        'nomsa',
        'POST',
        `/api/offers/${await claimDairy(t)}/handover/donor-confirm`,
        donorConfirmForm(45),
      ),
    error: {
      code: 'INVALID_STATE',
      send: async (t) =>
        t.request(
          'nomsa',
          'POST',
          `/api/offers/${await t.offerId('Bread and dry goods, tomorrow')}/handover/donor-confirm`,
          donorConfirmForm(45),
        ),
    },
  },
  'POST /api/offers/:id/handover/recipient-confirm': {
    success: async (t) =>
      t.request(
        'peter',
        'POST',
        `/api/offers/${await t.offerId('Function surplus, cold platters')}/handover/recipient-confirm`,
        { conditionOnReceipt: 'good' },
      ),
    error: {
      code: 'INVALID_STATE',
      send: async (t) =>
        t.request(
          'nosipho',
          'POST',
          `/api/offers/${await t.offerId('Bread, 30 loaves')}/handover/recipient-confirm`,
          { conditionOnReceipt: 'good' },
        ),
    },
  },
  'GET /api/handovers': {
    success: (t) => t.request('nadia', 'GET', '/api/handovers?condition=problem'),
    error: {
      code: 'VALIDATION_FAILED',
      send: (t) => t.request('nadia', 'GET', '/api/handovers?condition=awful'),
    },
  },
  'POST /api/handovers/:id/resolution': {
    success: async (t) =>
      t.request(
        'nadia',
        'POST',
        `/api/handovers/${await t.handoverId('Tomatoes and leafy greens')}/resolution`,
        { resolutionNote: 'The donor agreed to credit the recipient on the next collection' },
      ),
    error: {
      code: 'INVALID_STATE',
      send: async (t) =>
        t.request(
          'nadia',
          'POST',
          `/api/handovers/${await t.handoverId('Function surplus, cold platters')}/resolution`,
          { resolutionNote: 'Nothing was wrong with this one' },
        ),
    },
  },
  'GET /api/handovers/:id/photo': {
    success: async (t) =>
      t.request('nomsa', 'GET', `/api/handovers/${await dairyHandover(t)}/photo`),
    error: {
      code: 'NOT_FOUND',
      send: async (t) =>
        t.request('riaan', 'GET', `/api/handovers/${await dairyHandover(t)}/photo`),
    },
  },

  'POST /api/claims/:id/collection': {
    success: async (t) =>
      t.request('nadia', 'POST', `/api/claims/${await transportClaim(t)}/collection`, driver()),
    error: {
      code: 'INVALID_STATE',
      send: async (t) =>
        t.request(
          'nadia',
          'POST',
          `/api/claims/${await t.claimId('Function surplus, cold platters')}/collection`,
          driver(),
        ),
    },
  },
  'PATCH /api/collections/:id': {
    success: async (t) => {
      const dispatched = await t.request(
        'nadia',
        'POST',
        `/api/claims/${await transportClaim(t)}/collection`,
        driver(),
      );
      const { collection } = (await dispatched.json()) as CollectionResponse;
      return t.request('nadia', 'PATCH', `/api/collections/${collection.id}`, {
        status: 'completed',
      });
    },
    error: {
      code: 'INVALID_STATE',
      send: async (t) =>
        t.request(
          'nadia',
          'PATCH',
          `/api/collections/${await t.collectionId('Pastries and day-old bread')}`,
          { status: 'completed' },
        ),
    },
  },

  'PUT /api/collections/:id/driver-link': {
    success: async (t) => {
      const dispatched = await t.request(
        'nadia',
        'POST',
        `/api/claims/${await transportClaim(t)}/collection`,
        driver(),
      );
      const { collection } = (await dispatched.json()) as CollectionResponse;
      return t.request('nadia', 'PUT', `/api/collections/${collection.id}/driver-link`, {
        driverToken: newToken(),
      });
    },
    error: {
      code: 'INVALID_STATE',
      send: async (t) =>
        t.request(
          'nadia',
          'PUT',
          `/api/collections/${await t.collectionId('Pastries and day-old bread')}/driver-link`,
          { driverToken: newToken() },
        ),
    },
  },
  'GET /api/driver-collections/:token': {
    success: async (t) => {
      const driverToken = newToken();
      await t.request('nadia', 'POST', `/api/claims/${await transportClaim(t)}/collection`, {
        ...driver(),
        driverToken,
      });
      return t.request('anonymous', 'GET', `/api/driver-collections/${driverToken}`);
    },
    error: {
      code: 'NOT_FOUND',
      send: (t) => t.request('anonymous', 'GET', `/api/driver-collections/${newToken()}`),
    },
  },

  'GET /api/notifications': {
    success: (t) => t.request('peter', 'GET', '/api/notifications'),
    error: {
      code: 'UNAUTHENTICATED',
      send: (t) => t.request('anonymous', 'GET', '/api/notifications'),
    },
  },
  'POST /api/notifications/:id/read': {
    success: async (t) =>
      t.request('peter', 'POST', `/api/notifications/${await t.notificationId('peter')}/read`),
    error: {
      code: 'NOT_FOUND',
      send: (t) => t.request('peter', 'POST', `/api/notifications/${UNKNOWN_ID}/read`),
    },
  },
  'POST /api/webhooks/twilio/inbound': {
    success: async (t) =>
      t.twilio('/api/webhooks/twilio/inbound', {
        MessageSid: `SM${'c'.repeat(32)}`,
        From: `whatsapp:${personFor('thandi').phone}`,
        Body: `yes ${await t.offerReference('Mixed produce, full pallet')}`,
      }),
    error: {
      code: 'FORBIDDEN',
      send: (t) =>
        t.twilio(
          '/api/webhooks/twilio/inbound',
          { MessageSid: `SM${'d'.repeat(32)}`, From: personFor('thandi').phone, Body: 'YES' },
          null,
        ),
    },
  },
  'POST /api/webhooks/twilio/status': {
    success: (t) =>
      t.twilio('/api/webhooks/twilio/status', {
        MessageSid: `SM${'e'.repeat(32)}`,
        MessageStatus: 'delivered',
      }),
    error: {
      code: 'FORBIDDEN',
      send: (t) =>
        t.twilio(
          '/api/webhooks/twilio/status',
          { MessageSid: `SM${'e'.repeat(32)}`, MessageStatus: 'delivered' },
          'bm90IGEgdHdpbGlvIHNpZ25hdHVyZQ==',
        ),
    },
  },

  'GET /api/reports/impact': {
    success: (t) =>
      t.request('zanele', 'GET', `/api/reports/impact?from=${t.period.from}&to=${t.period.to}`),
    error: {
      code: 'VALIDATION_FAILED',
      send: (t) =>
        t.request('zanele', 'GET', `/api/reports/impact?from=${t.period.to}&to=${t.period.from}`),
    },
  },
  'GET /api/reports/outcomes': {
    success: (t) =>
      t.request('zanele', 'GET', `/api/reports/outcomes?from=${t.period.from}&to=${t.period.to}`),
    error: {
      code: 'FORBIDDEN',
      send: (t) =>
        t.request('nadia', 'GET', `/api/reports/outcomes?from=${t.period.from}&to=${t.period.to}`),
    },
  },
  'GET /api/reports/export': {
    success: (t) =>
      t.request(
        'zanele',
        'GET',
        `/api/reports/export?from=${t.period.from}&to=${t.period.to}&format=csv`,
      ),
    error: {
      code: 'VALIDATION_FAILED',
      send: (t) =>
        t.request(
          'zanele',
          'GET',
          `/api/reports/export?from=${t.period.from}&to=${t.period.to}&format=pdf`,
        ),
    },
  },
  'GET /api/valuation-rates': {
    success: (t) => t.request('zanele', 'GET', '/api/valuation-rates'),
    error: { code: 'FORBIDDEN', send: (t) => t.request('nadia', 'GET', '/api/valuation-rates') },
  },
  'PUT /api/valuation-rates': {
    success: (t) =>
      t.request('zanele', 'PUT', '/api/valuation-rates', {
        items: [{ category: 'bakery', ratePerKg: 24.5 }],
      }),
    error: {
      code: 'VALIDATION_FAILED',
      send: (t) =>
        t.request('zanele', 'PUT', '/api/valuation-rates', {
          items: [
            { category: 'bakery', ratePerKg: 24.5 },
            { category: 'bakery', ratePerKg: 25 },
          ],
        }),
    },
  },
  'POST /api/tax-certificates': {
    success: async (t) =>
      t.request('zanele', 'POST', '/api/tax-certificates', {
        donorOrganisationId: await t.organisationId('Woodstock Deli & Bistro'),
        periodStart: t.period.from,
        periodEnd: t.period.to,
      }),
    error: {
      code: 'INVALID_STATE',
      send: async (t) =>
        t.request('zanele', 'POST', '/api/tax-certificates', {
          donorOrganisationId: await t.organisationId('Woodstock Deli & Bistro'),
          periodStart: '2020-01-01',
          periodEnd: '2020-01-31',
        }),
    },
  },
  'GET /api/tax-certificates': {
    success: async (t) => {
      await t.certificateId("Ouma's Bakery");
      return t.request('riaan', 'GET', '/api/tax-certificates');
    },
    error: {
      code: 'NOT_FOUND',
      send: async (t) =>
        t.request(
          'riaan',
          'GET',
          `/api/tax-certificates?donorOrganisationId=${await t.organisationId('Kaap Foods')}`,
        ),
    },
  },
  'GET /api/tax-certificates/:id/pdf': {
    success: async (t) =>
      t.request(
        'riaan',
        'GET',
        `/api/tax-certificates/${await t.certificateId("Ouma's Bakery")}/pdf`,
      ),
    error: {
      code: 'NOT_FOUND',
      send: async (t) =>
        t.request(
          'riaan',
          'GET',
          `/api/tax-certificates/${await t.certificateId('Kaap Foods')}/pdf`,
        ),
    },
  },

  'GET /api/users': {
    success: (t) => t.request('zanele', 'GET', '/api/users?role=coordinator'),
    error: { code: 'FORBIDDEN', send: (t) => t.request('nadia', 'GET', '/api/users') },
  },
  'POST /api/users': {
    success: (t) =>
      t.request('zanele', 'POST', '/api/users', {
        fullName: 'Lerato Mokoena',
        email: 'lerato@fedsa.example',
        role: 'coordinator',
        phone: '+27829990001',
        languagePreference: 'en',
      }),
    error: {
      code: 'VALIDATION_FAILED',
      send: (t) =>
        t.request('zanele', 'POST', '/api/users', {
          fullName: 'Riaan again',
          email: personFor('riaan').email,
          role: 'coordinator',
          phone: '+27829990002',
          languagePreference: 'en',
        }),
    },
  },
  'PATCH /api/users/:id': {
    success: async (t) =>
      t.request('zanele', 'PATCH', `/api/users/${await t.userId('marius')}`, { status: 'active' }),
    error: {
      code: 'INVALID_STATE',
      send: async (t) =>
        t.request('zanele', 'PATCH', `/api/users/${await t.userId('zanele')}`, {
          status: 'disabled',
        }),
    },
  },
  'POST /api/users/:id/password-reset': {
    // its own new account. resetting a seeded person would end sessions the other cases share
    success: async (t) => {
      const created = await t.request('zanele', 'POST', '/api/users', {
        fullName: 'Ayanda Khumalo',
        email: 'ayanda@fedsa.example',
        role: 'coordinator',
        phone: '+27829990003',
        languagePreference: 'en',
      });
      const { user } = (await created.json()) as CreateUserResponse;
      return t.request('zanele', 'POST', `/api/users/${user.id}/password-reset`);
    },
    error: {
      code: 'INVALID_STATE',
      send: async (t) =>
        t.request('zanele', 'POST', `/api/users/${await t.userId('zanele')}/password-reset`),
    },
  },
  'GET /api/audit-log': {
    success: (t) =>
      t.request(
        'zanele',
        'GET',
        `/api/audit-log?from=${t.period.from}&to=${t.period.to}&action=disable_user`,
      ),
    error: {
      code: 'VALIDATION_FAILED',
      send: (t) => t.request('zanele', 'GET', '/api/audit-log?action=delete_everything'),
    },
  },
};

/** in the routes table but not served yet. a route leaves this list when its case above is added */
export const NOT_YET_SERVED: RouteKey[] = ['POST /api/claims/:id/override'];
