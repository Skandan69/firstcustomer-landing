const engine = require('../website-intelligence/audit');
const repository = require('../website-intelligence/repository');
const { validatePublicUrl } = require('../website-intelligence/fetcher');

const BODY_LIMIT = 16 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;
const buckets = new Map();

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Use POST to run a website audit.'); }
  const contentType = String(req.headers?.['content-type'] || '').toLowerCase();
  if (contentType && !contentType.includes('application/json')) return sendError(res, 400, 'INVALID_BODY', 'Send a valid JSON request body.');
  const workspaceId = String(req.headers?.['x-workspace-id'] || '');
  if (!UUID.test(workspaceId)) return sendError(res, 400, 'INVALID_WORKSPACE', 'Create a valid local workspace before auditing a website.');
  const parsed = parseBody(req.body);
  if (!parsed.ok) return sendError(res, parsed.status, parsed.code, parsed.message);
  if (!allowRequest(clientIp(req))) return sendError(res, 429, 'AUDIT_RATE_LIMITED', 'Too many website audits. Please wait a minute and try again.');
  try {
    const publicUrl = await validatePublicUrl(parsed.value.website);
    const website = publicUrl.href;
    if (!parsed.value.refresh) {
      const cached = await repository.findRecent(workspaceId, website);
      if (cached) return res.status(200).json({ audit: cached, cached: true });
    }
    const audit = await engine.auditWebsite(website);
    await repository.saveAudit(workspaceId, parsed.value.business, audit);
    return res.status(200).json({ audit, cached: false });
  } catch (error) {
    console.error('[website-intelligence]', { code: error.code || 'AUDIT_FAILED', status: error.status || 500 });
    return sendError(res, error.status || 502, error.code || 'AUDIT_FAILED', userMessage(error));
  }
};

function parseBody(raw) {
  if (raw === undefined || raw === null) return invalid(400, 'INVALID_BODY', 'Send a JSON request body.');
  let body = raw;
  if (typeof raw === 'string') {
    if (Buffer.byteLength(raw) > BODY_LIMIT) return invalid(413, 'REQUEST_TOO_LARGE', 'The audit request is too large.');
    try { body = JSON.parse(raw); } catch { return invalid(400, 'INVALID_JSON', 'Send valid JSON.'); }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return invalid(400, 'INVALID_BODY', 'Send a JSON object.');
  if (Buffer.byteLength(JSON.stringify(body)) > BODY_LIMIT) return invalid(413, 'REQUEST_TOO_LARGE', 'The audit request is too large.');
  if (typeof body.website !== 'string' || !body.website.trim() || body.website.length > 2048) return invalid(400, 'INVALID_WEBSITE_URL', 'Choose a business with a valid public website.');
  if (body.refresh !== undefined && typeof body.refresh !== 'boolean') return invalid(400, 'INVALID_REFRESH', 'Refresh must be true or false.');
  return { ok: true, value: { website: body.website.trim(), refresh: body.refresh === true, business: sanitizeBusiness(body.business) } };
}
function sanitizeBusiness(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return { provider: text(value.provider, 32), providerId: text(value.providerId, 256), name: text(value.name, 180) };
}
function text(value, max) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function invalid(status, code, message) { return { ok: false, status, code, message }; }
function sendError(res, status, code, message) { return res.status(status).json({ error: { code, message } }); }
function userMessage(error) {
  const allowed = new Set(['INVALID_WEBSITE_URL','UNSAFE_WEBSITE_URL','WEBSITE_DNS_FAILED','WEBSITE_TIMEOUT','WEBSITE_UNREACHABLE','INVALID_REDIRECT','TOO_MANY_REDIRECTS','WEBSITE_TOO_LARGE','PERSISTENCE_NOT_CONFIGURED','PERSISTENCE_AUTH_FAILED','PERSISTENCE_TABLE_NOT_EXPOSED','PERSISTENCE_SCHEMA_MISMATCH','PERSISTENCE_TIMEOUT','PERSISTENCE_UNAVAILABLE']);
  return allowed.has(error.code) ? error.message : 'The website audit could not be completed. Please try again.';
}
function clientIp(req) { return String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim(); }
function allowRequest(ip, now = Date.now()) { for (const [key, bucket] of buckets) if (now - bucket.startedAt > WINDOW_MS) buckets.delete(key); const bucket = buckets.get(ip); if (!bucket || now - bucket.startedAt > WINDOW_MS) { buckets.set(ip, { startedAt: now, count: 1 }); return true; } bucket.count += 1; return bucket.count <= MAX_REQUESTS; }

module.exports.parseBody = parseBody;
module.exports.userMessage = userMessage;
