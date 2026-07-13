const { checkRateLimit, fetchWithTimeout, limitedText, parseJsonBody, providerError, readProviderJson, requireMethod, sendError } = require('./_shared/provider');

const YOUTUBE_RESOURCES = new Set(['search', 'videos']);
const YOUTUBE_PARAMS = new Set(['part', 'q', 'type', 'order', 'maxResults', 'relevanceLanguage', 'publishedAfter', 'id', 'chart', 'regionCode', 'videoCategoryId']);

module.exports = async function handler(req, res) {
  const action = String(req.query?.action || '');
  try {
    if (action === 'configuration') return configuration(req, res);
    if (action === 'anthropic') return await anthropic(req, res);
    if (action === 'serpapi') return await serpapi(req, res);
    if (action === 'youtube') return await youtube(req, res);
    if (action === 'google-search') return await googleSearch(req, res);
    throw providerError('NOT_FOUND', 'Choose a supported tool operation.', 404);
  } catch (error) {
    return sendError(res, error, `tool-suite-${action || 'unknown'}`);
  }
};

function configuration(req, res) {
  requireMethod(req, ['GET']);
  res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
  return res.status(200).json(configurationStatus(process.env));
}

async function anthropic(req, res) {
  requireMethod(req, ['POST']);
  checkRateLimit(req, 'anthropic', 15);
  if (!process.env.ANTHROPIC_API_KEY) throw providerError('SETUP_REQUIRED', 'Anthropic is not configured on the server.', 503);
  const body = parseJsonBody(req);
  const messages = Array.isArray(body.messages) ? body.messages.slice(0, 8).map((message) => ({
    role: message?.role === 'assistant' ? 'assistant' : 'user',
    content: limitedText(message?.content, 12_000, 'a prompt')
  })) : [];
  if (!messages.length) throw providerError('VALIDATION_ERROR', 'Enter a prompt.', 400);
  const maxTokens = Math.min(Math.max(Number(body.max_tokens) || 600, 64), 1800);
  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001', max_tokens: maxTokens, messages })
  }, 20_000);
  return res.status(200).json(await readProviderJson(response));
}

async function serpapi(req, res) {
  requireMethod(req, ['POST']);
  checkRateLimit(req, 'serpapi', 30);
  if (!process.env.SERPAPI_KEY) throw providerError('SETUP_REQUIRED', 'Rank checking is not configured on the server.', 503);
  const body = parseJsonBody(req, 8 * 1024);
  const keyword = limitedText(body.keyword, 160, 'a keyword');
  const domain = normalizeDomain(limitedText(body.domain, 253, 'a valid domain'));
  const params = new URLSearchParams({ engine: 'google', q: keyword, num: '100', api_key: process.env.SERPAPI_KEY });
  const response = await fetchWithTimeout(`https://serpapi.com/search.json?${params}`, {}, 15_000);
  const payload = await readProviderJson(response);
  const organicResults = Array.isArray(payload.organic_results) ? payload.organic_results : [];
  const match = organicResults.find((result) => hostMatches(result.link, domain));
  return res.status(200).json({ found: Boolean(match), position: match ? Number(match.position) || organicResults.indexOf(match) + 1 : 100 });
}

async function youtube(req, res) {
  requireMethod(req, ['GET']);
  checkRateLimit(req, 'youtube', 60);
  if (!process.env.YOUTUBE_API_KEY) throw providerError('SETUP_REQUIRED', 'YouTube data is not configured on the server.', 503);
  const resource = String(req.query?.resource || '');
  if (!YOUTUBE_RESOURCES.has(resource)) throw providerError('VALIDATION_ERROR', 'Choose a supported YouTube operation.', 400);
  const params = new URLSearchParams({ key: process.env.YOUTUBE_API_KEY });
  for (const [key, value] of Object.entries(req.query || {})) {
    if (!YOUTUBE_PARAMS.has(key) || typeof value !== 'string') continue;
    if (value.length > 500) throw providerError('VALIDATION_ERROR', 'A YouTube parameter is too long.', 400);
    params.set(key, value);
  }
  const response = await fetchWithTimeout(`https://www.googleapis.com/youtube/v3/${resource}?${params}`, {}, 12_000);
  return res.status(200).json(await readProviderJson(response));
}

async function googleSearch(req, res) {
  requireMethod(req, ['GET']);
  checkRateLimit(req, 'google-search', 60);
  const key = process.env.GOOGLE_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_SEARCH_ENGINE_ID || process.env.GOOGLE_SEARCH_CX;
  if (!key || !cx) throw providerError('SETUP_REQUIRED', 'Google Search is not configured on the server.', 503);
  const query = limitedText(req.query?.q, 240, 'a search query');
  const num = Math.min(Math.max(Number(req.query?.num) || 10, 1), 10);
  const params = new URLSearchParams({ key, cx, q: query, num: String(num) });
  const response = await fetchWithTimeout(`https://www.googleapis.com/customsearch/v1?${params}`, {}, 12_000);
  return res.status(200).json(await readProviderJson(response));
}

function configurationStatus(env = {}) {
  return {
    anthropicConfigured: Boolean(env.ANTHROPIC_API_KEY),
    serpApiConfigured: Boolean(env.SERPAPI_KEY),
    youtubeConfigured: Boolean(env.YOUTUBE_API_KEY),
    googleSearchConfigured: Boolean(env.GOOGLE_SEARCH_API_KEY && (env.GOOGLE_SEARCH_ENGINE_ID || env.GOOGLE_SEARCH_CX)),
    googlePlacesConfigured: Boolean(env.GOOGLE_PLACES_API_KEY),
    supabaseConfigured: Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY)
  };
}

function normalizeDomain(value) {
  const candidate = value.includes('://') ? value : `https://${value}`;
  try { return new URL(candidate).hostname.replace(/^www\./, '').toLowerCase(); }
  catch { throw providerError('VALIDATION_ERROR', 'Enter a valid domain.', 400); }
}
function hostMatches(link, domain) {
  try { const host = new URL(link).hostname.replace(/^www\./, '').toLowerCase(); return host === domain || host.endsWith(`.${domain}`); }
  catch { return false; }
}

module.exports.configurationStatus = configurationStatus;
module.exports.normalizeDomain = normalizeDomain;
