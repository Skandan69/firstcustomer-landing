const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const OVERPASS_ENDPOINTS = [
  'https://gall.openstreetmap.de/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
];
const USER_AGENT = 'FirstCustomer-BusinessDiscovery/1.0 (https://www.firstcustomer.in/)';
const { normalizeBusiness } = require('../business-model');
const { normalizeCategoryText, resolveCategory, significantTerms } = require('../../../server/business-categories');
const CACHE_TTL = { geocode: 24 * 60 * 60 * 1000, search: 10 * 60 * 1000 };
const BUSINESS_KEYS = ['amenity', 'shop', 'office', 'craft', 'healthcare', 'tourism', 'leisure', 'sport', 'beauty', 'service'];
const cache = new Map();
let nextNominatimRequestAt = 0;

async function searchOpenData(criteria, options = {}) {
  const geocode = await geocodeLocation(criteria.location, options);
  const radiusMeters = criteria.radiusKm * 1000;
  const category = resolveCategory(criteria.category);
  const cacheKey = `search:v2:${geocode.latitude.toFixed(4)}:${geocode.longitude.toFixed(4)}:${radiusMeters}:${normalizeCategoryText(criteria.category)}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;
  const query = buildOverpassQuery(geocode.latitude, geocode.longitude, radiusMeters, criteria.category);
  const endpoints = options.overpassEndpoint ? [options.overpassEndpoint] : OVERPASS_ENDPOINTS;
  const retryDeadline = Date.now() + (options.overpassTotalTimeoutMs || 22_000);
  let response; let lastError;
  for (const endpoint of endpoints) {
    const remainingMs = retryDeadline - Date.now();
    if (remainingMs <= 0) break;
    try {
      response = await fetchWithTimeout(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'User-Agent': USER_AGENT }, body: `data=${encodeURIComponent(query)}` }, Math.min(options.overpassTimeoutMs || 14_000, remainingMs));
      if (response.ok) break;
      lastError = providerError(response.status === 429 ? 'OPEN_DATA_RATE_LIMITED' : 'OPEN_DATA_UNAVAILABLE', `Open Data provider returned HTTP ${response.status}.`, response.status === 429 ? 429 : 502);
    } catch (error) {
      lastError = providerError('OPEN_DATA_TIMEOUT', error.name === 'AbortError' ? 'Open Data search timed out. Please try again.' : 'Open Data search could not be reached.', 504);
    }
  }
  if (!response?.ok) throw lastError || providerError('OPEN_DATA_UNAVAILABLE', 'Open Data search is temporarily unavailable.', 502);
  const data = await response.json().catch(() => ({ elements: [] }));
  const businesses = filterAndRankElements(data.elements || [], criteria.category, geocode, radiusMeters);
  const targeted = Boolean(category.input);
  const notice = !targeted
    ? 'Open Data results do not include Google ratings or review counts, and phone or website information may be incomplete.'
    : category.recognized
      ? `OpenStreetMap coverage for ${category.label} may be incomplete. Ratings and review counts are not available, and contact details may be missing.`
      : `Best-effort Open Data search for “${category.input}”. Only businesses with a meaningful name or tagged-category match are shown; coverage may be incomplete.`;
  const result = { provider: 'open_data', businesses, nextPageToken: null, notice, categoryMatch: categorySummary(category) };
  setCache(cacheKey, result, CACHE_TTL.search);
  return result;
}

async function geocodeLocation(location, options = {}) {
  const key = `geocode:${location.toLowerCase()}`;
  const cached = getCache(key);
  if (cached) return cached;
  await waitForNominatimSlot();
  const url = `${options.nominatimEndpoint || NOMINATIM_ENDPOINT}?format=jsonv2&limit=1&q=${encodeURIComponent(location)}`;
  let response;
  try { response = await fetchWithTimeout(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' } }, options.nominatimTimeoutMs || 10_000); }
  catch (error) { throw providerError('LOCATION_LOOKUP_FAILED', error.name === 'AbortError' ? 'Location lookup timed out.' : 'Location lookup could not be reached.', 502); }
  if (!response.ok) throw providerError(response.status === 429 ? 'OPEN_DATA_RATE_LIMITED' : 'LOCATION_LOOKUP_FAILED', 'Location lookup is temporarily unavailable.', response.status === 429 ? 429 : 502);
  const data = await response.json().catch(() => []);
  if (!data.length) throw providerError('LOCATION_NOT_FOUND', 'OpenStreetMap could not find that location.', 404);
  const result = { latitude: Number(data[0].lat), longitude: Number(data[0].lon), displayName: text(data[0].display_name) };
  setCache(key, result, CACHE_TTL.geocode);
  return result;
}

function buildOverpassQuery(lat, lon, radius, category = '') {
  const selected = resolveCategory(category);
  let clauses;
  if (selected.input && selected.recognized) {
    clauses = selected.osmTags.flatMap((tag) => elementClauses(lat, lon, radius, `["name"]["${escapeQuery(tag.key)}"="${escapeQuery(tag.value)}"]`));
  } else if (selected.input) {
    const pattern = customNamePattern(selected.input);
    clauses = pattern ? BUSINESS_KEYS.flatMap((key) => elementClauses(lat, lon, radius, `["name"~"${pattern}",i]["${escapeQuery(key)}"]`)) : [];
  } else {
    clauses = BUSINESS_KEYS.flatMap((key) => elementClauses(lat, lon, radius, `["name"]["${escapeQuery(key)}"]`));
  }
  return `[out:json][timeout:20];(${clauses.join('')});out center 120;`;
}
function elementClauses(lat, lon, radius, filters) { return ['node', 'way', 'relation'].map((type) => `${type}(around:${radius},${lat},${lon})${filters};`); }
function categoryClauses(category) { const selected = resolveCategory(category); return selected.recognized ? selected.osmTags.map((tag) => [tag.key, tag.value]) : []; }

function filterAndRankElements(elements, categoryInput, center, radiusMeters) {
  const selected = resolveCategory(categoryInput);
  const targeted = Boolean(selected.input);
  const normalized = [];
  for (const element of elements) {
    const match = classifyOsmElement(element, selected);
    if (targeted && !match.matched) continue;
    const business = normaliseOsmElement(element, { selected, match, center });
    if (!business || !withinRadius(business, center, radiusMeters)) continue;
    normalized.push(business);
  }
  normalized.sort((left, right) => (right.matchConfidence ?? 0) - (left.matchConfidence ?? 0) || (left.distanceMeters ?? Infinity) - (right.distanceMeters ?? Infinity) || left.name.localeCompare(right.name) || left.providerId.localeCompare(right.providerId));
  return dedupe(normalized).slice(0, targeted ? 50 : 100);
}

function classifyOsmElement(element = {}, selectedInput = '') {
  const selected = typeof selectedInput === 'string' ? resolveCategory(selectedInput) : selectedInput;
  const tags = element.tags || {};
  if (!selected.input) return { matched: true, categoryId: '', label: humanise(first(...BUSINESS_KEYS.map((key) => tags[key]))), reason: 'Nearby named OpenStreetMap feature', confidence: 0.5 };
  if (isExcluded(tags, selected.excludedTags || [])) return { matched: false, reason: 'Explicitly excluded OSM category', confidence: 0 };
  if (selected.recognized) {
    const exact = selected.osmTags.find((tag) => normalizeCategoryText(tags[tag.key]) === normalizeCategoryText(tag.value));
    if (exact) return { matched: true, categoryId: selected.id, label: selected.label, reason: `OSM tag ${exact.key}=${exact.value}`, confidence: 1 };
    const keyword = keywordMatch(tags, selected.keywords || []);
    if (keyword && hasBusinessTag(tags)) return { matched: true, categoryId: selected.id, label: selected.label, reason: `Business name/category keyword “${keyword}”`, confidence: 0.8 };
    return { matched: false, reason: `No ${selected.label} tag or keyword match`, confidence: 0 };
  }
  const terms = significantTerms(selected.input);
  if (!terms.length || !hasBusinessTag(tags)) return { matched: false, reason: 'No meaningful custom-category terms', confidence: 0 };
  const haystack = normalizeCategoryText([tags.name, tags['name:en'], ...BUSINESS_KEYS.map((key) => tags[key])].filter(Boolean).join(' '));
  const matches = terms.filter((term) => haystack.includes(term));
  const required = Math.min(2, terms.length);
  if (matches.length < required) return { matched: false, reason: 'Insufficient custom-category evidence', confidence: 0 };
  return { matched: true, categoryId: selected.id, label: selected.label, reason: `Best-effort keyword match: ${matches.join(', ')}`, confidence: terms.length === 1 ? 0.65 : 0.55 + Math.min(0.2, matches.length * 0.05) };
}

function normaliseOsmElement(element = {}, context = {}) {
  const tags = element.tags || {};
  const lat = numberOrNull(element.lat ?? element.center?.lat);
  const lon = numberOrNull(element.lon ?? element.center?.lon);
  const rawType = first(...BUSINESS_KEYS.map((key) => tags[key]));
  const selected = context.selected || resolveCategory('');
  const match = context.match || classifyOsmElement(element, selected);
  const distanceMeters = context.center && lat !== null && lon !== null ? Math.round(haversine(context.center.latitude, context.center.longitude, lat, lon)) : null;
  return normalizeBusiness({
    provider: 'openstreetmap', providerId: `${element.type || 'node'}:${element.id || ''}`, name: first(tags.name, tags['name:en']),
    category: match.label || humanise(rawType), matchedCategory: match.categoryId || '', matchReason: match.reason || '', matchConfidence: match.confidence,
    types: BUSINESS_KEYS.map((key) => tags[key]).filter(Boolean), osmTags: pickRelevantTags(tags), address: formatAddress(tags),
    city: first(tags['addr:city'], tags['addr:town'], tags['addr:village']), state: text(tags['addr:state']), country: text(tags['addr:country']),
    latitude: lat, longitude: lon, distanceMeters, phone: first(tags['contact:phone'], tags.phone), email: first(tags.email, tags['contact:email']),
    website: first(tags.website, tags['contact:website']), rating: null, reviewCount: null, businessStatus: '',
    sourceUrl: element.id ? `https://www.openstreetmap.org/${element.type || 'node'}/${element.id}` : '', openingHours: text(tags.opening_hours)
  });
}

function matchesCategory(business, category) {
  if (!category) return true;
  const selected = resolveCategory(category);
  const tags = business.osmTags || {};
  if (selected.recognized && selected.osmTags.some((tag) => normalizeCategoryText(tags[tag.key]) === normalizeCategoryText(tag.value))) return true;
  const haystack = normalizeCategoryText([business.name, business.category, ...(business.types || []), ...Object.values(tags)].join(' '));
  const terms = selected.recognized ? selected.keywords.map(normalizeCategoryText) : significantTerms(category);
  const matches = terms.filter((term) => haystack.includes(term)).length;
  return terms.length > 0 && matches >= (selected.recognized ? 1 : Math.min(2, terms.length));
}
function isExcluded(tags, exclusions) { return exclusions.some((entry) => (entry.values || []).map(normalizeCategoryText).includes(normalizeCategoryText(tags[entry.key]))); }
function keywordMatch(tags, keywords) { const haystack = normalizeCategoryText([tags.name, tags['name:en'], ...BUSINESS_KEYS.map((key) => tags[key])].filter(Boolean).join(' ')); return keywords.map(normalizeCategoryText).find((keyword) => keyword && haystack.includes(keyword)) || ''; }
function hasBusinessTag(tags) { return BUSINESS_KEYS.some((key) => typeof tags[key] === 'string' && tags[key].trim()); }
function customNamePattern(value) { const terms = significantTerms(value); return terms.length ? terms.map(escapeRegex).join('|') : ''; }
function escapeRegex(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function escapeQuery(value) { return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }
function categorySummary(selected) { return { recognized: selected.recognized, id: selected.id || '', label: selected.label || '', bestEffort: Boolean(selected.input && !selected.recognized) }; }
function formatAddress(tags) { return [tags['addr:housenumber'], tags['addr:street'], tags['addr:suburb'], tags['addr:city'], tags['addr:postcode']].filter(Boolean).join(', '); }
function pickRelevantTags(tags) { const keys = [...BUSINESS_KEYS, 'cuisine', 'opening_hours', 'wheelchair', 'email', 'brand']; return Object.fromEntries(keys.filter((key) => tags[key]).map((key) => [key, tags[key]])); }
function withinRadius(business, center, radius) { if (business.latitude === null || business.longitude === null) return false; return haversine(center.latitude, center.longitude, business.latitude, business.longitude) <= radius; }
function haversine(aLat, aLon, bLat, bLon) { const r = 6371000; const p = Math.PI / 180; const x = (bLat - aLat) * p; const y = (bLon - aLon) * p; const h = Math.sin(x / 2) ** 2 + Math.cos(aLat * p) * Math.cos(bLat * p) * Math.sin(y / 2) ** 2; return 2 * r * Math.asin(Math.sqrt(h)); }
function dedupe(items) { const ids = new Set(); const signatures = new Set(); return items.filter((item) => { const id = item.providerId || ''; const signature = `${normalizeCategoryText(item.name)}|${roundCoordinate(item.latitude)}|${roundCoordinate(item.longitude)}`; if ((id && ids.has(id)) || (normalizeCategoryText(item.name) && signatures.has(signature))) return false; if (id) ids.add(id); signatures.add(signature); return true; }); }
function roundCoordinate(value) { return Number.isFinite(Number(value)) ? Number(value).toFixed(4) : ''; }
function getCache(key) { const item = cache.get(key); if (!item || item.expiresAt < Date.now()) { cache.delete(key); return null; } return item.value; }
function setCache(key, value, ttl) { cache.set(key, { value, expiresAt: Date.now() + ttl }); if (cache.size > 200) cache.delete(cache.keys().next().value); }
async function waitForNominatimSlot() { const delay = Math.max(0, nextNominatimRequestAt - Date.now()); nextNominatimRequestAt = Math.max(Date.now(), nextNominatimRequestAt) + 1000; if (delay) await new Promise((resolve) => setTimeout(resolve, delay)); }
function providerError(code, message, status) { return Object.assign(new Error(message), { code, status }); }
async function fetchWithTimeout(url, options, timeoutMs) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs); try { return await fetch(url, { ...options, signal: controller.signal }); } finally { clearTimeout(timer); } }
function first(...values) { return text(values.find((value) => typeof value === 'string' && value.trim()) || ''); }
function text(value) { return typeof value === 'string' ? value : ''; }
function numberOrNull(value) { if (value === null || value === undefined || value === '') return null; return Number.isFinite(Number(value)) ? Number(value) : null; }
function humanise(value) { return text(value).replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase()); }

module.exports = { buildOverpassQuery, categoryClauses, classifyOsmElement, dedupe, filterAndRankElements, haversine, matchesCategory, normaliseOsmElement, searchOpenData, withinRadius, OVERPASS_ENDPOINTS, _cache: cache };
