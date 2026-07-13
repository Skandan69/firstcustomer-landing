const test = require('node:test');
const assert = require('node:assert/strict');
const { categories, resolveCategory } = require('../server/business-categories');
const { buildOverpassQuery, classifyOsmElement, dedupe, filterAndRankElements, normaliseOsmElement, OVERPASS_ENDPOINTS, searchOpenData, _cache } = require('../api/local-businesses/providers/open-data');
const { discoverBusinesses } = require('../api/local-businesses/providers');

const CENTER = { latitude: 17.45, longitude: 78.53 };
const dentist = (type = 'node', id = 1, tags = { name: 'Malkajgiri Dental Care', amenity: 'dentist' }) => ({ type, id, lat: 17.451, lon: 78.531, center: { lat: 17.451, lon: 78.531 }, tags });

test('canonical registry contains every required supported category', () => {
  const required = ['dentist','doctor','clinic','hospital','pharmacy','restaurant','cafe','bakery','hotel','gym','spa','beauty_salon','school','college','lawyer','accountant','real_estate_agency','plumber','electrician','painter','pest_control','waterproofing','car_repair','clothing_store','electronics_store','grocery_store','furniture_store'];
  assert.deepEqual(required.filter((id) => !categories.some((category) => category.id === id)), []);
  assert.equal(resolveCategory('dental clinic').id, 'dentist');
  assert.equal(resolveCategory('beauty parlour').id, 'beauty_salon');
});

test('recognized categories generate exact node, way, and relation Overpass tags', () => {
  const query = buildOverpassQuery(17.45, 78.53, 5000, 'dentist');
  assert.match(query, /node\(around:5000,17\.45,78\.53\)\["name"\]\["amenity"="dentist"\]/);
  assert.match(query, /way\(around:5000,17\.45,78\.53\)\["name"\]\["healthcare"="dentist"\]/);
  assert.match(query, /relation\(around:5000,17\.45,78\.53\)\["name"\]\["amenity"="dentist"\]/);
  assert.doesNotMatch(query, /\["name"\]\["amenity"\]/);
  assert.doesNotMatch(query, /library|college|bus_station|police|stadium|hostel|theatre/);
});

test('Open Data uses current HTTPS Overpass mirrors and no obsolete Kumi hostname', () => {
  assert.ok(OVERPASS_ENDPOINTS.length >= 2);
  assert.ok(OVERPASS_ENDPOINTS.every((endpoint) => endpoint.startsWith('https://')));
  assert.ok(OVERPASS_ENDPOINTS.includes('https://overpass.private.coffee/api/interpreter'));
  assert.ok(OVERPASS_ENDPOINTS.every((endpoint) => !endpoint.includes('overpass.kumi.systems')));
});

test('Open Data mirror retries respect the total retry deadline', async () => {
  _cache.clear();
  const oldFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    if (String(url).includes('nominatim')) return response([{ lat: '17.45', lon: '78.53', display_name: 'Malkajgiri' }]);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 100);
      options.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); });
    });
    return response({ elements: [] });
  };
  const startedAt = Date.now();
  try {
    await assert.rejects(
      searchOpenData({ location: 'Retry Deadline Regression', category: 'dentist', radiusKm: 5 }, { overpassTimeoutMs: 15, overpassTotalTimeoutMs: 40 }),
      (error) => error.code === 'OPEN_DATA_TIMEOUT'
    );
    assert.ok(Date.now() - startedAt < 200, 'retry deadline should bound mirror failover');
  } finally { global.fetch = oldFetch; }
});

test('dentist matching accepts exact dental tags and named dental clinics', () => {
  assert.equal(classifyOsmElement(dentist(), 'dentist').matched, true);
  assert.equal(classifyOsmElement(dentist('node', 2, { name: 'Smile Centre', healthcare: 'dentist' }), 'dentist').matched, true);
  const clinic = classifyOsmElement(dentist('node', 3, { name: 'Bright Dental Clinic', amenity: 'clinic' }), 'dentist');
  assert.equal(clinic.matched, true);
  assert.equal(clinic.confidence, 0.8);
});

test('dentist matching rejects every explicitly unrelated category', () => {
  const unrelated = [
    { amenity: 'library', name: 'City Library' }, { amenity: 'college', name: 'City College' },
    { amenity: 'bus_station', name: 'Malkajgiri Bus Stop' }, { amenity: 'police', name: 'Police Station' },
    { leisure: 'stadium', name: 'City Stadium' }, { tourism: 'hostel', name: 'Student Hostel' },
    { amenity: 'theatre', name: 'Drama Theatre' }
  ];
  for (const tags of unrelated) assert.equal(classifyOsmElement(dentist('node', Math.random(), tags), 'dentist').matched, false, tags.name);
});

test('restaurant searches reject dentists and retain restaurants', () => {
  const results = filterAndRankElements([
    dentist('node', 1, { name: 'Smile Dental', amenity: 'dentist' }),
    dentist('node', 2, { name: 'Spice Garden', amenity: 'restaurant' })
  ], 'restaurant', CENTER, 5000);
  assert.deepEqual(results.map((item) => item.name), ['Spice Garden']);
  assert.equal(results[0].matchedCategory, 'restaurant');
});

test('custom categories query and return only meaningful best-effort matches', () => {
  const query = buildOverpassQuery(17.45, 78.53, 5000, 'vedic astrologer');
  assert.match(query, /\["name"~"vedic\|astrologer",i\]/);
  assert.doesNotMatch(query, /\["name"\]\["amenity"\]/);
  const results = filterAndRankElements([
    dentist('node', 1, { name: 'Vedic Star Astrologer', office: 'company' }),
    dentist('node', 2, { name: 'Central Library', amenity: 'library' }),
    dentist('node', 3, { name: 'Vedic Restaurant', amenity: 'restaurant' })
  ], 'vedic astrologer', CENTER, 5000);
  assert.deepEqual(results.map((item) => item.name), ['Vedic Star Astrologer']);
  assert.match(results[0].matchReason, /Best-effort keyword match/);
});

test('node, way, and relation results normalize with match evidence', () => {
  const items = ['node', 'way', 'relation'].map((type, index) => normaliseOsmElement(dentist(type, index + 1), { selected: resolveCategory('dentist'), match: classifyOsmElement(dentist(type, index + 1), 'dentist'), center: CENTER }));
  assert.deepEqual(items.map((item) => item.providerId), ['node:1', 'way:2', 'relation:3']);
  assert.ok(items.every((item) => item.category === 'Dentist' && item.matchReason === 'OSM tag amenity=dentist' && item.matchConfidence === 1));
  assert.ok(items.every((item) => item.sourceUrl.includes('openstreetmap.org')));
});

test('targeted results are ranked by confidence then distance and capped', () => {
  const elements = [
    { type: 'node', id: 1, lat: 17.4501, lon: 78.5301, tags: { name: 'Dental Named Clinic', amenity: 'clinic' } },
    { type: 'node', id: 2, lat: 17.454, lon: 78.534, tags: { name: 'Exact Dentist', amenity: 'dentist' } },
    { type: 'node', id: 3, lat: 17.451, lon: 78.531, tags: { name: 'Near Exact Dentist', healthcare: 'dentist' } }
  ];
  const results = filterAndRankElements(elements, 'dentist', CENTER, 5000);
  assert.deepEqual(results.map((item) => item.name), ['Near Exact Dentist', 'Exact Dentist', 'Dental Named Clinic']);
  assert.ok(results.length <= 50);
});

test('duplicate OSM IDs and node/way representations are removed deterministically', () => {
  const base = normaliseOsmElement(dentist('node', 1), { selected: resolveCategory('dentist'), match: classifyOsmElement(dentist(), 'dentist'), center: CENTER });
  const samePlace = { ...base, providerId: 'way:9' };
  const other = { ...base, providerId: 'node:2', name: 'Other Dentist', latitude: 17.452 };
  assert.deepEqual(dedupe([base, base, samePlace, other]).map((item) => item.providerId), ['node:1', 'node:2']);
});

test('Auto fallback preserves the exact requested category and strict query', async () => {
  _cache.clear();
  const oldFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('places.googleapis.com')) return response({ error: { status: 'PERMISSION_DENIED', message: 'denied' } }, 403);
    if (String(url).includes('nominatim')) return response([{ lat: '17.45', lon: '78.53', display_name: 'Malkajgiri' }]);
    return response({ elements: [dentist()] });
  };
  try {
    const result = await discoverBusinesses({ provider: 'auto', location: 'Malkajgiri Category Regression', category: 'Dentist', radiusKm: 5, pageToken: '' }, { googleApiKey: 'test-key' });
    assert.equal(result.provider, 'open_data');
    assert.equal(result.fallback.to, 'open_data');
    assert.equal(result.categoryMatch.id, 'dentist');
    assert.deepEqual(result.businesses.map((item) => item.category), ['Dentist']);
    const overpassBody = decodeURIComponent(calls.find((call) => call.options.method === 'POST' && !call.url.includes('places.googleapis.com')).options.body.slice(5));
    assert.match(overpassBody, /"amenity"="dentist"/);
  } finally { global.fetch = oldFetch; }
});

test('missing Open Data ratings render cleanly and audit availability follows website validity', async () => {
  const { renderBusinessCard } = await import('../assets/js/local-business/business-renderer.mjs');
  const withoutWebsite = renderBusinessCard({ provider: 'openstreetmap', providerId: 'node:1', name: 'Dentist', category: 'Dentist', matchedCategory: 'dentist', matchConfidence: 1, matchReason: 'OSM tag', rating: null, reviewCount: null, website: '', sourceUrl: '' });
  const withWebsite = renderBusinessCard({ provider: 'openstreetmap', providerId: 'node:2', name: 'Dentist', category: 'Dentist', matchedCategory: 'dentist', matchConfidence: 1, matchReason: 'OSM tag', rating: null, reviewCount: null, website: 'https://dentist.example', sourceUrl: '' });
  assert.match(withoutWebsite, /Rating unavailable from Open Data/);
  assert.doesNotMatch(withoutWebsite, /Not available · Not available/);
  assert.match(withoutWebsite, /data-audit-business="openstreetmap:node:1" disabled/);
  assert.doesNotMatch(withWebsite, /data-audit-business="openstreetmap:node:2" disabled/);
});

test('empty targeted result messages prefer zero relevant results', async () => {
  const { businessNoResultsMessage } = await import('../assets/js/local-business/business-renderer.mjs');
  assert.match(businessNoResultsMessage({ category: 'dentist' }, { label: 'Dentist', bestEffort: false }), /Zero relevant results are shown instead of unrelated places/);
  assert.match(businessNoResultsMessage({ category: 'vedic astrologer' }, { bestEffort: true }), /No confident Open Data matches/);
});

function response(data, status = 200) { return { ok: status >= 200 && status < 300, status, json: async () => data }; }
