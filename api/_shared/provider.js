const MAX_BODY_BYTES = 24 * 1024;
const rateBuckets = new Map();

function requireMethod(req, allowed) {
  if (allowed.includes(req.method)) return;
  const error = new Error(`Use ${allowed.join(' or ')}.`);
  error.code = 'METHOD_NOT_ALLOWED';
  error.status = 405;
  error.allow = allowed;
  throw error;
}

function parseJsonBody(req, maxBytes = MAX_BODY_BYTES) {
  const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
  if (Buffer.byteLength(raw, 'utf8') > maxBytes) throw providerError('REQUEST_TOO_LARGE', 'The request is too large.', 413);
  try {
    const value = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object required');
    return value;
  } catch {
    throw providerError('INVALID_JSON', 'Send a valid JSON object.', 400);
  }
}

function limitedText(value, max, field) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw providerError('VALIDATION_ERROR', `Enter ${field}.`, 400);
  if (text.length > max) throw providerError('VALIDATION_ERROR', `${field} is too long.`, 400);
  return text;
}

function checkRateLimit(req, scope, limit = 30, windowMs = 60_000) {
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  const address = forwarded || req.socket?.remoteAddress || 'unknown';
  const key = `${scope}:${address}`;
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) { rateBuckets.set(key, { count: 1, resetAt: now + windowMs }); return; }
  bucket.count += 1;
  if (bucket.count > limit) throw providerError('RATE_LIMITED', 'Too many requests. Please wait and retry.', 429);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') throw providerError('PROVIDER_TIMEOUT', 'The provider took too long to respond. Please retry.', 504);
    throw providerError('PROVIDER_UNAVAILABLE', 'The provider is temporarily unavailable.', 502);
  } finally {
    clearTimeout(timer);
  }
}

async function readProviderJson(response) {
  const payload = await response.json().catch(() => ({}));
  if (response.ok) return payload;
  const providerCode = payload?.error?.status || payload?.error?.code || 'PROVIDER_ERROR';
  const code = response.status === 429 ? 'QUOTA_EXCEEDED' : providerCode;
  const message = response.status === 429
    ? 'The provider quota has been reached. Try again later.'
    : response.status === 401 || response.status === 403
      ? 'The provider configuration was rejected. Check the server-side key and restrictions.'
      : 'The provider could not complete the request.';
  throw providerError(code, message, response.status === 429 ? 429 : 502);
}

function providerError(code, message, status = 500) {
  return Object.assign(new Error(message), { code, status });
}

function sendError(res, error, scope = 'provider') {
  const status = Number(error.status) || 500;
  if (error.allow) res.setHeader('Allow', error.allow.join(', '));
  console.error(`[${scope}]`, { code: error.code || 'UNEXPECTED_FAILURE', status });
  return res.status(status).json({ error: { code: error.code || 'UNEXPECTED_FAILURE', message: error.message || 'The service is temporarily unavailable.' } });
}

module.exports = { checkRateLimit, fetchWithTimeout, limitedText, parseJsonBody, providerError, readProviderJson, requireMethod, sendError, _rateBuckets: rateBuckets };
