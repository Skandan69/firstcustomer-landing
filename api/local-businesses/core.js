const ALLOWED_RADII = new Set([2, 5, 10, 20]);
const LIMITS = Object.freeze({ bodyBytes: 4096, location: 120, category: 80, pageToken: 2048 });

function validateRequestBody(rawBody) {
  if (rawBody === null || rawBody === undefined) return invalid('INVALID_BODY', 'Send a valid JSON request body.');
  let body = rawBody;
  if (typeof rawBody === 'string') {
    if (Buffer.byteLength(rawBody, 'utf8') > LIMITS.bodyBytes) return invalid('REQUEST_TOO_LARGE', 'The request body is too large.');
    try { body = JSON.parse(rawBody); } catch { return invalid('INVALID_BODY', 'Send a valid JSON request body.'); }
  }
  if (!isPlainObject(body)) return invalid('INVALID_BODY', 'Send a valid JSON request body.');
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > LIMITS.bodyBytes) return invalid('REQUEST_TOO_LARGE', 'The request body is too large.');
  if (typeof body.location !== 'string' || !body.location.trim() || body.location.length > LIMITS.location) return invalid('INVALID_LOCATION', 'Enter a valid location.');
  if (body.category !== undefined && typeof body.category !== 'string') return invalid('INVALID_CATEGORY', 'Enter a valid business category.');
  if ((body.category || '').length > LIMITS.category) return invalid('INVALID_CATEGORY', 'Enter a shorter business category.');
  const radiusKm = body.radiusKm === undefined ? 5 : Number(body.radiusKm);
  if (!ALLOWED_RADII.has(radiusKm)) return invalid('INVALID_RADIUS', 'Choose a radius of 2, 5, 10, or 20 km.');
  if (body.pageToken !== undefined && (typeof body.pageToken !== 'string' || body.pageToken.length > LIMITS.pageToken)) return invalid('INVALID_PAGE_TOKEN', 'The next page is no longer available. Start a new search.');
  return { ok: true, value: { location: clean(body.location), category: clean(body.category || ''), radiusKm, pageToken: clean(body.pageToken || '') } };
}

function normalisePlace(place = {}) {
  const website = stringValue(place.websiteUri);
  return {
    id: stringValue(place.id), name: stringValue(place.displayName?.text), category: humanise(place.primaryType || place.types?.[0] || ''),
    types: Array.isArray(place.types) ? place.types.filter((type) => typeof type === 'string') : [], rating: Number.isFinite(place.rating) ? place.rating : null,
    reviewCount: Number.isFinite(place.userRatingCount) ? place.userRatingCount : 0, address: stringValue(place.formattedAddress), phone: stringValue(place.nationalPhoneNumber),
    internationalPhone: stringValue(place.internationalPhoneNumber), website, websiteStatus: website ? 'not_checked' : 'no_website', businessStatus: stringValue(place.businessStatus),
    googleMapsUrl: stringValue(place.googleMapsUri), latitude: numberOrNull(place.location?.latitude), longitude: numberOrNull(place.location?.longitude)
  };
}

function dedupeBusinesses(items) { const seen = new Set(); return items.filter((item) => { const key = item.id || `${item.name}|${item.address}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
function invalid(code, message) { return { ok: false, error: { code, message } }; }
function isPlainObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function clean(value) { return String(value).trim().replace(/[\u0000-\u001f]/g, ''); }
function stringValue(value) { return typeof value === 'string' ? value : ''; }
function numberOrNull(value) { return Number.isFinite(value) ? value : null; }
function humanise(value) { return stringValue(value).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }

module.exports = { LIMITS, dedupeBusinesses, normalisePlace, validateRequestBody };
