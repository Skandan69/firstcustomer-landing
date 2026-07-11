const { dedupeBusinesses, normalisePlace, validateRequestBody } = require('./core');

const MAX_RESULTS = 20;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;
const requestBuckets = new Map();
const FIELD_MASK = [
  'places.id', 'places.displayName', 'places.primaryType', 'places.types', 'places.rating', 'places.userRatingCount',
  'places.formattedAddress', 'places.nationalPhoneNumber', 'places.internationalPhoneNumber', 'places.websiteUri',
  'places.businessStatus', 'places.googleMapsUri', 'places.location', 'nextPageToken'
].join(',');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Use POST for business searches.'); }
  const contentType = String(req.headers?.['content-type'] || '').toLowerCase();
  if (contentType && !contentType.includes('application/json')) return sendError(res, 400, 'INVALID_BODY', 'Send a valid JSON request body.');
  const validation = validateRequestBody(req.body);
  if (!validation.ok) return res.status(validation.error.code === 'REQUEST_TOO_LARGE' ? 413 : 400).json({ error: validation.error });
  if (!allowRequest(clientIp(req))) return sendError(res, 429, 'PLACES_QUOTA_EXCEEDED', 'Too many searches. Please wait a minute and try again.');
  const key = typeof process.env.GOOGLE_PLACES_API_KEY === 'string' ? process.env.GOOGLE_PLACES_API_KEY.trim() : '';
  if (!key) {
    return sendError(res, 503, 'PLACES_ENV_NOT_INJECTED', 'This deployment did not receive a non-empty GOOGLE_PLACES_API_KEY. Redeploy after enabling the variable for the Preview environment.');
  }

  const { location, category, radiusKm, pageToken } = validation.value;
  const googleBody = { textQuery: category ? `${category} in ${location}` : `businesses in ${location}`, languageCode: 'en', maxResultCount: MAX_RESULTS };
  if (pageToken) googleBody.pageToken = pageToken;
  // radiusKm is validated and retained in the public contract. Text Search interprets the named location;
  // a strict radius requires a later geocoding step and locationBias circle.
  void radiusKm;

  try {
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELD_MASK }, body: JSON.stringify(googleBody)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const googleMessage = typeof data.error?.message === 'string' && data.error.message.trim() ? data.error.message.trim() : 'Google Places rejected the request without an error message.';
      const mapped = mapGoogleError(response.status, data.error?.status, googleMessage, Boolean(pageToken));
      console.error('[local-business-search] Google Places error', { httpStatus: response.status, upstreamStatus: data.error?.status || 'UNKNOWN', code: mapped.code, googleMessage });
      return sendError(res, mapped.status, mapped.code, googleMessage, { provider: 'google_places', providerStatus: data.error?.status || null });
    }
    console.info('[local-business-search] Google Places response received', { ok: true, placeCount: Array.isArray(data.places) ? data.places.length : 0, hasNextPage: Boolean(data.nextPageToken) });
    const businesses = dedupeBusinesses((data.places || []).slice(0, MAX_RESULTS).map(normalisePlace));
    return res.status(200).json({ businesses, nextPageToken: data.nextPageToken || null });
  } catch (error) {
    console.error('[local-business-search]', { name: error.name, message: error.message });
    return sendError(res, 502, 'SEARCH_FAILED', 'Business search is temporarily unavailable. Please try again.');
  }
};

function mapGoogleError(httpStatus, upstreamStatus, googleMessage = '', paginating = false) {
  if (/billing|billing account|account verification/i.test(googleMessage)) return { status: 503, code: 'PLACES_BILLING_REQUIRED', message: googleMessage };
  if (/not been (used|enabled)|api.*not enabled|access not configured/i.test(googleMessage)) return { status: 503, code: 'PLACES_API_NOT_ENABLED', message: googleMessage };
  if (/api key not valid|invalid api key|key.*restricted|requests from referer/i.test(googleMessage)) return { status: 503, code: 'PLACES_KEY_REJECTED', message: googleMessage };
  if (httpStatus === 429 || upstreamStatus === 'RESOURCE_EXHAUSTED') return { status: 429, code: 'PLACES_QUOTA_EXCEEDED', message: 'Search quota has been reached. Please try again later.' };
  if (httpStatus === 403 || ['PERMISSION_DENIED', 'FAILED_PRECONDITION'].includes(upstreamStatus)) return { status: 503, code: 'PLACES_PERMISSION_DENIED', message: 'Business search is unavailable because Google Places access needs attention.' };
  if (httpStatus === 400 && paginating) return { status: 400, code: 'INVALID_PAGE_TOKEN', message: 'That page has expired. Start a new search to continue.' };
  if (httpStatus === 400 || upstreamStatus === 'INVALID_ARGUMENT') return { status: 400, code: 'INVALID_LOCATION', message: 'Enter a valid location and try again.' };
  return { status: 502, code: 'SEARCH_FAILED', message: 'Google Places is temporarily unavailable. Please try again.' };
}

function sendError(res, status, code, message, metadata) { return res.status(status).json({ error: { code, message, ...(metadata || {}) } }); }
function clientIp(req) { return String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim(); }
function allowRequest(ip, now = Date.now()) { for (const [key, bucket] of requestBuckets) if (now - bucket.startedAt > WINDOW_MS) requestBuckets.delete(key); const bucket = requestBuckets.get(ip); if (!bucket || now - bucket.startedAt > WINDOW_MS) { requestBuckets.set(ip, { startedAt: now, count: 1 }); return true; } bucket.count += 1; return bucket.count <= MAX_REQUESTS_PER_WINDOW; }

module.exports.FIELD_MASK = FIELD_MASK;
module.exports.mapGoogleError = mapGoogleError;
