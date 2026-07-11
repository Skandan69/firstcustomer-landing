const test = require('node:test');
const assert = require('node:assert/strict');
const { dedupeBusinesses, normalisePlace, validateRequestBody } = require('../api/local-businesses/core');
const searchHandler = require('../api/local-businesses/search');

test('normalises a complete Google place', () => {
  const result = normalisePlace({ id: 'p1', displayName: { text: 'Alpha Dental' }, primaryType: 'dental_clinic', types: ['dental_clinic', 'health'], rating: 4.7, userRatingCount: 82, formattedAddress: 'Main Road', nationalPhoneNumber: '040 1234', internationalPhoneNumber: '+91 40 1234', websiteUri: 'https://example.com', businessStatus: 'OPERATIONAL', googleMapsUri: 'https://maps.google.com/x', location: { latitude: 17.4, longitude: 78.5 } });
  assert.deepEqual(result, { id: 'p1', name: 'Alpha Dental', category: 'Dental Clinic', types: ['dental_clinic', 'health'], rating: 4.7, reviewCount: 82, address: 'Main Road', phone: '040 1234', internationalPhone: '+91 40 1234', website: 'https://example.com', websiteStatus: 'not_checked', businessStatus: 'OPERATIONAL', googleMapsUrl: 'https://maps.google.com/x', latitude: 17.4, longitude: 78.5 });
});

test('normalises missing fields without inventing values', () => {
  assert.deepEqual(normalisePlace({ id: 'p2' }), { id: 'p2', name: '', category: '', types: [], rating: null, reviewCount: 0, address: '', phone: '', internationalPhone: '', website: '', websiteStatus: 'no_website', businessStatus: '', googleMapsUrl: '', latitude: null, longitude: null });
});

test('filters use AND behaviour and website opportunity sorting', async () => {
  const { filterBusinesses } = await import('../assets/js/local-business/business-filters.mjs');
  const businesses = [{ id: 'web', name: 'Web', website: 'https://x.test', rating: 5, reviewCount: 100, phone: '1', category: 'Cafe', businessStatus: 'OPERATIONAL' }, { id: 'best', name: 'Best', website: '', rating: 4.5, reviewCount: 60, phone: '2', category: 'Cafe', businessStatus: 'OPERATIONAL' }, { id: 'low', name: 'Low', website: '', rating: 3, reviewCount: 10, phone: '', category: 'Cafe', businessStatus: 'CLOSED_TEMPORARILY' }];
  assert.deepEqual(filterBusinesses(businesses, { website: 'none', rating: 4, reviews: 20, phone: true, category: 'Cafe', businessStatus: 'OPERATIONAL', sort: 'website-opportunity' }).map((b) => b.id), ['best']);
  assert.deepEqual(filterBusinesses(businesses, { website: 'all', rating: 0, reviews: 0, phone: false, category: '', businessStatus: '', sort: 'website-opportunity' }).map((b) => b.id), ['best', 'low', 'web']);
});

test('removes duplicate place IDs', () => { assert.deepEqual(dedupeBusinesses([{ id: 'a' }, { id: 'a' }, { id: 'b' }]).map((b) => b.id), ['a', 'b']); });
test('rejects unsupported request bodies', () => { assert.equal(validateRequestBody([]).error.code, 'INVALID_BODY'); assert.equal(validateRequestBody({ location: '', radiusKm: 5 }).error.code, 'INVALID_LOCATION'); assert.equal(validateRequestBody({ location: 'Hyderabad', radiusKm: 3 }).error.code, 'INVALID_RADIUS'); });

test('returns a safe no-key configuration error', async () => {
  const previous = process.env.GOOGLE_PLACES_API_KEY; delete process.env.GOOGLE_PLACES_API_KEY;
  const response = mockResponse(); await searchHandler({ method: 'POST', body: { location: 'Hyderabad', category: '', radiusKm: 5 }, headers: {}, socket: {} }, response);
  assert.equal(response.statusCode, 503); assert.deepEqual(response.body, { error: { code: 'PLACES_NOT_CONFIGURED', message: 'Business search is not configured yet.' } });
  if (previous) process.env.GOOGLE_PLACES_API_KEY = previous;
});

function mockResponse() { return { statusCode: 200, body: null, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }
