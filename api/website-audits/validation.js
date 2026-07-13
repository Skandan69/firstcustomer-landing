const db = require('../persistence/supabase');
const { validatePublicUrl } = require('../../server/website-intelligence/fetcher');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

module.exports = async function handler(req, res) {
  if (process.env.VERCEL_ENV !== 'preview') {
    return sendError(res, 404, 'NOT_FOUND', 'Not found.');
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Use GET to verify a preview audit.');
  }

  const workspaceId = String(req.headers?.['x-workspace-id'] || '');
  if (!UUID.test(workspaceId)) {
    return sendError(res, 400, 'INVALID_WORKSPACE', 'Use a valid validation workspace.');
  }

  try {
    const input = String(req.query?.website || '');
    const parsed = new URL(input);
    if (parsed.protocol !== 'https:') throw unsafeUrl();
    const website = (await validatePublicUrl(parsed.href)).href;
    const rows = await db.query('website_audits', {
      query: `workspace_id=eq.${workspaceId}&website=eq.${encodeURIComponent(website)}&select=id,workspace_id,website,opportunity_score,health_score,summary,audited_at,created_at,updated_at&limit=1`
    });
    return res.status(200).json({ row: rows?.[0] || null });
  } catch (error) {
    const allowed = new Set([
      'INVALID_WEBSITE_URL',
      'UNSAFE_WEBSITE_URL',
      'WEBSITE_DNS_FAILED',
      'PERSISTENCE_NOT_CONFIGURED',
      'PERSISTENCE_AUTH_FAILED',
      'PERSISTENCE_TABLE_NOT_EXPOSED',
      'PERSISTENCE_SCHEMA_MISMATCH',
      'PERSISTENCE_TIMEOUT',
      'PERSISTENCE_UNAVAILABLE'
    ]);
    const code = allowed.has(error.code) ? error.code : 'VALIDATION_FAILED';
    const message = allowed.has(error.code) ? error.message : 'The preview audit could not be verified.';
    return sendError(res, error.status || 502, code, message);
  }
};

function unsafeUrl() {
  return Object.assign(new Error('Use a public HTTPS website URL.'), {
    code: 'UNSAFE_WEBSITE_URL',
    status: 400
  });
}

function sendError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

