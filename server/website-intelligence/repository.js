const db = require('../../api/persistence/supabase');
const RECENT_AUDIT_MS = 24 * 60 * 60 * 1000;

async function findRecent(workspaceId, website, now = Date.now()) {
  const rows = await db.query('website_audits', { query: `workspace_id=eq.${workspaceId}&website=eq.${encodeURIComponent(website)}&select=summary,audited_at&order=audited_at.desc&limit=1` });
  const row = rows?.[0];
  if (!row || !row.summary || now - new Date(row.audited_at).getTime() > RECENT_AUDIT_MS) return null;
  return row.summary;
}

async function saveAudit(workspaceId, business, audit) {
  const rows = await db.query('website_audits', {
    method: 'POST',
    query: 'on_conflict=workspace_id,website',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: {
      workspace_id: workspaceId,
      business_provider: clean(business?.provider, 32),
      business_provider_id: clean(business?.providerId, 256),
      business_name: clean(business?.name, 180),
      website: audit.requestedUrl,
      opportunity_score: audit.opportunityScore,
      health_score: audit.healthScore,
      summary: audit,
      audited_at: audit.auditedAt,
      updated_at: new Date().toISOString()
    }
  });
  return rows?.[0] || null;
}
function clean(value, max) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }

module.exports = { RECENT_AUDIT_MS, findRecent, saveAudit };
