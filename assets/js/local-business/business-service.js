import { LOCAL_BUSINESS_CONFIG } from './configuration.js';

export class BusinessSearchError extends Error {
  constructor(message, code = 'SERVICE_ERROR', detail = '') { super(message); this.name = 'BusinessSearchError'; this.code = code; this.detail = detail; }
}

export async function searchLocalBusinesses(criteria) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOCAL_BUSINESS_CONFIG.requestTimeoutMs);
  try {
    const response = await fetch(LOCAL_BUSINESS_CONFIG.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(criteria), signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new BusinessSearchError(payload.message || 'The business search service is unavailable.', payload.code || 'SERVICE_ERROR', payload.detail || '');
    return { businesses: Array.isArray(payload.businesses) ? payload.businesses : [], nextPageToken: payload.nextPageToken || null };
  } catch (error) {
    if (error instanceof BusinessSearchError) throw error;
    if (error.name === 'AbortError') throw new BusinessSearchError('The search took too long. Please try again.', 'TIMEOUT');
    throw new BusinessSearchError('We could not reach the business search service.', 'NETWORK_ERROR', error.message);
  } finally { clearTimeout(timeout); }
}
