const MAX_RESULTS = 20;
const ALLOWED_RADII = new Set([2, 5, 10, 20]);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Use POST for business searches.' }); }
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return res.status(503).json({ code: 'CONFIGURATION_ERROR', message: 'Business search is not configured.' });
  const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body || {});
  const location = cleanText(body.location, 120); const category = cleanText(body.category, 80); const radiusKm = Number(body.radiusKm || 5);
  if (!location) return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Enter a location to search.' });
  if (!ALLOWED_RADII.has(radiusKm)) return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Choose a supported search radius.' });

  // TODO: Add per-IP/user rate limiting before expanding public usage.
  try {
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'places.id,places.displayName,places.primaryTypeDisplayName,places.types,places.rating,places.userRatingCount,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.businessStatus,places.googleMapsUri,nextPageToken' }, body: JSON.stringify({ textQuery: `${category ? `${category} in ` : 'businesses in '}${location}`, languageCode: 'en', maxResultCount: MAX_RESULTS }) });
    const data = await response.json();
    if (!response.ok) { console.error('[places-search]', response.status, data.error?.status); return res.status(response.status === 429 ? 429 : 502).json({ code: response.status === 429 ? 'RATE_LIMITED' : 'UPSTREAM_ERROR', message: response.status === 429 ? 'Search is busy. Please try again shortly.' : 'The business search service is temporarily unavailable.' }); }
    return res.status(200).json({ businesses: (data.places || []).slice(0, MAX_RESULTS).map(normalisePlace), nextPageToken: data.nextPageToken || null });
  } catch (error) { console.error('[places-search]', error); return res.status(500).json({ code: 'SERVICE_ERROR', message: 'The business search service is temporarily unavailable.' }); }
};

function normalisePlace(place) { return { id: place.id || '', name: place.displayName?.text || '', category: place.primaryTypeDisplayName?.text || humanise(place.types?.[0]) || '', rating: Number.isFinite(place.rating) ? place.rating : null, reviewCount: Number(place.userRatingCount || 0), address: place.formattedAddress || '', phone: place.internationalPhoneNumber || place.nationalPhoneNumber || '', website: place.websiteUri || '', websiteStatus: place.websiteUri ? 'unknown' : 'unknown', businessStatus: place.businessStatus || '', googleMapsUrl: place.googleMapsUri || '' }; }
function cleanText(value, max) { return typeof value === 'string' ? value.trim().replace(/[\u0000-\u001f]/g, '').slice(0, max) : ''; }
function humanise(value = '') { return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }
function safeJson(value) { try { return JSON.parse(value); } catch { return {}; } }
