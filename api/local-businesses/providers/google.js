const GOOGLE_ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';
const { normalizeBusiness } = require('../business-model');
const { resolveCategory } = require('../../../server/business-categories');

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.primaryType',
  'places.types',
  'places.rating',
  'places.userRatingCount',
  'places.formattedAddress',
  'places.addressComponents',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.businessStatus',
  'places.googleMapsUri',
  'places.location',
  'nextPageToken'
].join(',');

async function searchGoogle(criteria, options = {}) {
  const key = typeof options.apiKey === 'string' ? options.apiKey.trim() : '';
  if (!key) {
    throw providerError(
      'GOOGLE_NOT_CONFIGURED',
      'Google Places is not configured for this deployment.',
      503,
      true,
      googleDiagnostic({ keyConfigured: false })
    );
  }

  const request = buildGoogleRequest(criteria);
  let response;
  try {
    response = await fetchWithTimeout(GOOGLE_ENDPOINT, {
      method: request.method,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': FIELD_MASK
      },
      body: JSON.stringify(request.body)
    }, options.timeoutMs || 12000);
  } catch (error) {
    throw providerError(
      'GOOGLE_UNAVAILABLE',
      error.name === 'AbortError' ? 'Google Places timed out.' : 'Google Places could not be reached.',
      502,
      true,
      googleDiagnostic({ keyConfigured: true })
    );
  }

  const data = await response.json().catch(() => ({}));
  if (data.error?.message) data.error.message = redactSecret(data.error.message, key);
  if (!response.ok) {
    const error = mapGoogleError(response.status, data.error, Boolean(criteria.pageToken));
    error.diagnostic.requestPayload = request.body;
    throw error;
  }
  const businesses = (data.places || []).map((place) => normaliseGooglePlace(place, request.selected)).filter(Boolean);
  return {
    provider: 'google',
    businesses,
    nextPageToken: data.nextPageToken || null,
    notice: businesses.length ? '' : 'Google Places returned no matching businesses.',
    categoryMatch: {
      recognized: request.selected.recognized,
      id: request.selected.id || '',
      label: request.selected.label || '',
      bestEffort: false
    }
  };
}

function buildGoogleRequest(criteria) {
  const selected = resolveCategory(criteria.category);
  const searchTerm = selected.input ? (selected.googleTerm || selected.input) : 'businesses';
  const body = {
    textQuery: `${searchTerm} in ${criteria.location}`,
    languageCode: 'en',
    maxResultCount: 20
  };
  if (criteria.pageToken) body.pageToken = criteria.pageToken;
  return { endpoint: GOOGLE_ENDPOINT, method: 'POST', fieldMask: FIELD_MASK, body, selected };
}

function normaliseGooglePlace(place = {}, selected = resolveCategory('')) {
  const website = text(place.websiteUri);
  const component = (type) => text((place.addressComponents || []).find((item) => item.types?.includes(type))?.longText);
  return normalizeBusiness({
    provider: 'google',
    providerId: text(place.id),
    name: text(place.displayName?.text),
    category: selected.recognized ? selected.label : humanise(place.primaryType || place.types?.[0] || ''),
    matchedCategory: selected.input ? (selected.id || selected.input) : '',
    matchReason: selected.input ? `Google Places targeted search for ${selected.googleTerm || selected.input}` : 'Google Places business result',
    matchConfidence: selected.input ? 0.9 : 0.7,
    types: place.types,
    address: text(place.formattedAddress),
    city: component('locality') || component('administrative_area_level_2'),
    state: component('administrative_area_level_1'),
    country: component('country'),
    latitude: numberOrNull(place.location?.latitude),
    longitude: numberOrNull(place.location?.longitude),
    phone: text(place.internationalPhoneNumber || place.nationalPhoneNumber),
    email: '',
    website,
    rating: Number.isFinite(place.rating) ? place.rating : null,
    reviewCount: Number.isFinite(place.userRatingCount) ? place.userRatingCount : null,
    businessStatus: text(place.businessStatus),
    sourceUrl: text(place.googleMapsUri),
    openingHours: ''
  });
}

function mapGoogleError(httpStatus, error = {}, paginating = false) {
  const upstreamMessage = text(error.message) || 'Google Places rejected the request.';
  const providerStatus = text(error.status);
  const diagnostic = googleDiagnostic({
    keyConfigured: true,
    httpStatus,
    providerStatus,
    upstreamMessage
  });

  if (httpStatus === 400 && paginating) {
    return providerError('INVALID_PAGE_TOKEN', 'The Google Places page token is no longer valid. Start a new search.', 400, false, diagnostic);
  }
  if (httpStatus === 429 || providerStatus === 'RESOURCE_EXHAUSTED') {
    return providerError('GOOGLE_QUOTA_EXCEEDED', 'Google Places quota exceeded. Try again later or review the Google Cloud quota.', 429, true, diagnostic);
  }
  if (/billing|billing account|account verification/i.test(upstreamMessage)) {
    return providerError('GOOGLE_BILLING_REQUIRED', 'Google Places billing is unavailable. Check the Google Cloud billing account.', 503, true, diagnostic);
  }
  if (/not been (used|enabled)|api.*not enabled|access not configured/i.test(upstreamMessage)) {
    return providerError('GOOGLE_API_NOT_ENABLED', 'Google Places API (New) is not enabled for the deployed key project.', 503, true, diagnostic);
  }
  if (httpStatus === 401 || providerStatus === 'UNAUTHENTICATED' || /api key.*(invalid|rejected)|invalid api key/i.test(upstreamMessage)) {
    return providerError('GOOGLE_API_KEY_REJECTED', 'Google Places API key was rejected. Check the deployed key and its API restrictions.', 503, true, diagnostic);
  }
  if (httpStatus === 403 || ['PERMISSION_DENIED', 'FAILED_PRECONDITION'].includes(providerStatus)) {
    return providerError('GOOGLE_PERMISSION_DENIED', 'Google Places permission denied. Check the key project, API restrictions, and Places API (New) access.', 503, true, diagnostic);
  }
  return providerError('GOOGLE_UNAVAILABLE', 'Google Places rejected the request. Try again later.', httpStatus >= 500 ? 502 : 400, httpStatus >= 500, diagnostic);
}

function googleDiagnostic({ keyConfigured, httpStatus = null, providerStatus = '', upstreamMessage = '' }) {
  return {
    provider: 'google',
    endpoint: GOOGLE_ENDPOINT,
    method: 'POST',
    fieldMask: FIELD_MASK,
    placesApi: 'new',
    keyConfigured: Boolean(keyConfigured),
    httpStatus: Number.isInteger(httpStatus) ? httpStatus : null,
    providerStatus,
    upstreamMessage
  };
}

function providerError(code, message, status, fallbackEligible, diagnostic) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.fallbackEligible = fallbackEligible;
  error.provider = 'google';
  error.diagnostic = diagnostic;
  return error;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

function text(value) { return typeof value === 'string' ? value : ''; }
function redactSecret(value, secret) { const message = text(value); return secret ? message.split(secret).join('[redacted]') : message; }
function numberOrNull(value) { return Number.isFinite(value) ? value : null; }
function humanise(value) { return text(value).replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase()); }

module.exports = { FIELD_MASK, GOOGLE_ENDPOINT, buildGoogleRequest, mapGoogleError, normaliseGooglePlace, redactSecret, searchGoogle };
