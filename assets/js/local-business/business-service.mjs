import { LOCAL_BUSINESS_CONFIG } from './configuration.mjs';
import { workspaceId } from './persistence-service.mjs';

let activeController = null;
const PROVIDERS = new Set(['auto', 'google', 'open_data']);

function track(event, properties) { try { window.analytics?.track(event, properties); } catch {} }

export class BusinessSearchError extends Error {
  constructor(message, code = 'SERVICE_ERROR', detail = '', metadata = {}) {
    super(message);
    this.name = 'BusinessSearchError';
    this.code = code;
    this.detail = detail;
    this.provider = metadata.provider || '';
    this.requestedProvider = metadata.requestedProvider || '';
    this.attemptedProviders = Array.isArray(metadata.attemptedProviders) ? metadata.attemptedProviders : [];
    this.diagnostic = metadata.diagnostic || null;
  }
}

export function buildSearchPayload(criteria = {}) {
  const provider = PROVIDERS.has(criteria.provider) ? criteria.provider : 'auto';
  const payload = {
    location: String(criteria.location || '').trim(),
    category: String(criteria.category || '').trim(),
    radiusKm: Number(criteria.radiusKm),
    provider
  };
  if (criteria.pageToken) payload.pageToken = String(criteria.pageToken);
  return payload;
}

export function cancelBusinessSearch() {
  if (activeController) activeController.abort();
  activeController = null;
}

export async function searchLocalBusinesses(criteria) {
  cancelBusinessSearch();
  const controller = new AbortController();
  activeController = controller;
  const timeout = setTimeout(() => controller.abort(), LOCAL_BUSINESS_CONFIG.requestTimeoutMs);
  const requestPayload = buildSearchPayload(criteria);
  try {
    track('business_search', {
      provider: requestPayload.provider,
      radius_km: requestPayload.radiusKm || 0,
      category_provided: Boolean(requestPayload.category)
    });
    const response = await fetch(LOCAL_BUSINESS_CONFIG.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Workspace-Id': workspaceId() },
      body: JSON.stringify(requestPayload),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new BusinessSearchError(
        payload.error?.message || 'The business search service is unavailable.',
        payload.error?.code || 'SEARCH_FAILED',
        '',
        {
          provider: payload.error?.provider || requestPayload.provider,
          requestedProvider: payload.error?.requestedProvider || requestPayload.provider,
          attemptedProviders: payload.error?.attemptedProviders || [],
          diagnostic: payload.error?.diagnostic || null
        }
      );
    }
    return {
      businesses: Array.isArray(payload.businesses) ? payload.businesses : [],
      nextPageToken: payload.nextPageToken || null,
      provider: payload.provider || null,
      notice: payload.notice || '',
      fallback: payload.fallback || null,
      categoryMatch: payload.categoryMatch || null
    };
  } catch (error) {
    if (error instanceof BusinessSearchError) throw error;
    if (error.name === 'AbortError') throw new BusinessSearchError('The search was cancelled or timed out.', 'TIMEOUT', '', { requestedProvider: requestPayload.provider });
    throw new BusinessSearchError('We could not reach the business search service.', 'NETWORK_ERROR', error.message, { requestedProvider: requestPayload.provider });
  } finally {
    clearTimeout(timeout);
    if (activeController === controller) activeController = null;
  }
}
