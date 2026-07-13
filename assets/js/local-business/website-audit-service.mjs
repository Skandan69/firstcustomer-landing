import { workspaceId } from './persistence-service.mjs';

const ENDPOINT = '/api/website-audits';

export async function auditBusinessWebsite(business, { refresh = false } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Workspace-Id': workspaceId() },
      body: JSON.stringify({ website: business.website, refresh, business: { provider: business.provider, providerId: business.providerId, name: business.name } }),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(payload.error?.message || 'The website audit could not be completed.'), { code: payload.error?.code || 'AUDIT_FAILED', status: response.status });
    return payload;
  } catch (error) {
    if (error.name === 'AbortError') throw Object.assign(new Error('The website audit took too long. Please try again.'), { code: 'AUDIT_TIMEOUT' });
    throw error;
  } finally { clearTimeout(timer); }
}
