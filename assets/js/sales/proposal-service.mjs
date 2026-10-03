import { workspaceId } from '../local-business/persistence-service.mjs';

const ENDPOINT = '/api/persistence';

async function request(resource,{method='GET',body,token=''}={}) {
  const query = new URLSearchParams({ resource });
  if (token) query.set('token', token);
  const headers = { 'Content-Type': 'application/json' };
  if (resource !== 'public_proposal') headers['X-Workspace-Id'] = workspaceId();
  const response = await fetch(`${ENDPOINT}?${query}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(payload.error?.message || 'Proposal service is temporarily unavailable.'), { code: payload.error?.code || 'PROPOSAL_FAILED', status: response.status });
  return payload;
}

export async function saveProposal({ businessId = '', business, proposal }) {
  const shareToken = crypto.randomUUID();
  const payload = await request('proposals', { method: 'POST', body: { shareToken, businessId, business, proposal } });
  const token = payload.item?.shareToken || shareToken;
  return { shareToken: token, url: `/proposal/?token=${encodeURIComponent(token)}`, createdAt: payload.item?.createdAt || '' };
}

export async function publicProposal(token) {
  const payload = await request('public_proposal', { token });
  return payload.item || null;
}

export async function sendProposalResponse(token,response,message='') {
  const payload = await request('proposal_response', { method: 'POST', token, body: { response, message: String(message || '').slice(0,600) } });
  return payload.item || null;
}
