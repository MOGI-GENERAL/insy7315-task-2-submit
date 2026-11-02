import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import type { DriverCollectionResponse } from '@fedsa/contract';
import { ApiError } from '../../data/ApiError';
import { createFakeDataLayer, DEMO_DRIVER_TOKEN } from '../../data/fake';
import { dictionaries } from '../../i18n/dictionaries';
import { LanguageContext } from '../../i18n/context';
import { createStore } from '../../store/store';
import { DriverView } from './DriverView';
import { driverState } from './state';

function render(state: Parameters<typeof DriverView>[0]['state'], language: 'en' | 'af' = 'en') {
  return renderToStaticMarkup(
    <LanguageContext.Provider
      value={{ language, dictionary: dictionaries[language], setLanguage: () => {} }}
    >
      <DriverView state={state} onRetry={() => {}} />
    </LanguageContext.Provider>,
  );
}

const loaded = (change: Partial<DriverCollectionResponse> = {}): DriverCollectionResponse => ({
  reference: 'K4F2',
  title: '62 loaves of bread',
  description: 'Behind the loading bay',
  category: 'bakery',
  quantityKg: 31,
  coldChain: 'ambient',
  collectionDeadline: '2026-10-03T15:00:00.000Z',
  scheduledFor: '2026-10-03T12:30:00.000Z',
  driverName: 'Themba Mokoena',
  pickup: {
    organisationName: 'Woodstock Bakery',
    address: '12 Long Street, Woodstock',
    contactName: 'Riaan de Villiers',
    contactPhone: '+27 82 000 0001',
  },
  dropOff: {
    organisationName: 'Siyakhula Shelter',
    address: '4 Lansdowne Road, Khayelitsha',
    contactName: 'Peter Dlamini',
    contactPhone: '+27820000002',
  },
  ...change,
});

describe('driver page', () => {
  test('shows the collection with both stops', () => {
    const html = render({ kind: 'ready', data: loaded() });

    expect(html).toContain('<h1>62 loaves of bread</h1>');
    expect(html).toContain('Collection K4F2');
    expect(html).toContain('31 kg');
    expect(html).toContain('Bakery');
    expect(html).toContain('Behind the loading bay');
    // 15:00 UTC and 12:30 UTC in South African time
    expect(html).toContain('17:00');
    expect(html).toContain('14:30');
    expect(html).toContain('Woodstock Bakery');
    expect(html).toContain('Siyakhula Shelter');
    expect(html).not.toContain('<img');
  });

  test('links each stop to maps and to a phone call', () => {
    const html = render({ kind: 'ready', data: loaded() });

    expect(html).toContain(
      'href="https://www.google.com/maps/search/?api=1&amp;query=12%20Long%20Street%2C%20Woodstock"',
    );
    expect(html).toContain('target="_blank" rel="noopener noreferrer"');
    expect(html).toContain('href="tel:+27820000001"');
    expect(html).toContain('Call Riaan de Villiers on +27 82 000 0001');
    expect(html).toContain('Open 4 Lansdowne Road, Khayelitsha in Maps');
    expect(html).toContain('(opens in a new tab)');
    expect(render({ kind: 'ready', data: loaded() }, 'af')).toContain('nuwe oortjie');
  });

  test('warns when the food has to stay cold', () => {
    expect(render({ kind: 'ready', data: loaded() })).not.toContain('banner');
    const cold = render({ kind: 'ready', data: loaded({ coldChain: 'frozen' }) });
    expect(cold).toContain('class="banner"');
    expect(cold).toContain('Must stay frozen');
  });

  test('leaves out the notes and the pickup time when there are none', () => {
    const html = render({
      kind: 'ready',
      data: loaded({ description: null, scheduledFor: null }),
    });
    expect(html).not.toContain('Notes');
    expect(html).not.toContain('Pickup time');
  });

  test('follows the chosen language', () => {
    expect(render({ kind: 'ready', data: loaded() }, 'af')).toContain('Afhaling K4F2');
  });

  test('a dead link shows no details', () => {
    const html = render({ kind: 'gone' });
    expect(html).toContain('This link is no longer available. Contact the coordinator who sent it.');
    expect(html).not.toContain('K4F2');
    expect(html).not.toContain('Try again');
  });

  test('a failed load offers a retry and says it is not the link', () => {
    const html = render({ kind: 'failed' });
    expect(html).toContain('role="alert"');
    expect(html).toContain('Could not load. Try again.');
    expect(html).toContain('Try again</button>');
    expect(html).not.toContain('no longer available');
  });
});

describe('driver page state', () => {
  const result = (change: object) => ({
    data: undefined,
    error: null,
    loading: false,
    reload: async () => {},
    ...change,
  });

  test('a 404 is a dead link and anything else is a failed load', () => {
    expect(driverState(result({ error: new ApiError('NOT_FOUND', 'x') })).kind).toBe('gone');
    expect(driverState(result({ error: new ApiError('RATE_LIMITED', 'x') })).kind).toBe('failed');
    expect(driverState(result({ error: new ApiError('INTERNAL', 'x') })).kind).toBe('failed');
    expect(driverState(result({ error: new TypeError('Failed to fetch') })).kind).toBe('failed');
  });

  test('is loading until there is data or an error', () => {
    expect(driverState(result({ loading: true })).kind).toBe('loading');
    expect(driverState(result({})).kind).toBe('loading');
    expect(driverState(result({ data: loaded() })).kind).toBe('ready');
  });
});

describe('driver page data', () => {
  const fake = () => createFakeDataLayer(createStore(), { delayMs: 0, failOn: new Set() });

  test('the demo link loads through the data layer', async () => {
    const page = await fake().driver.collection(DEMO_DRIVER_TOKEN);
    expect(page.reference).toMatch(/\S/);
    expect(driverState({ data: page, error: null, loading: false, reload: async () => {} }).kind).toBe(
      'ready',
    );
  });

  test('an unknown link and a failing call end in the two different states', async () => {
    const unknown = await fake()
      .driver.collection('Z'.repeat(43))
      .catch((e: unknown) => e);
    expect(driverState({ data: undefined, error: unknown, loading: false, reload: async () => {} }).kind).toBe(
      'gone',
    );

    const failing = createFakeDataLayer(createStore(), {
      delayMs: 0,
      failOn: new Set(['driver.collection']),
    });
    const failure = await failing.driver.collection(DEMO_DRIVER_TOKEN).catch((e: unknown) => e);
    expect(driverState({ data: undefined, error: failure, loading: false, reload: async () => {} }).kind).toBe(
      'failed',
    );
  });
});
