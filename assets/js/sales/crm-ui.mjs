import { buildPipeline, CRM_STAGES } from './crm-engine.mjs';
import { logFollowup, markLeadLost, markLeadWon, setCrmStage, setNextAction } from '../local-business/persistence-service.mjs';

let callbacks = { reload: async () => {}, showMessage: () => {} };

export function wireCrm(options = {}) {
  callbacks = { ...callbacks, ...options };
  const root = document.querySelector('#lbfCrm');
  if (!root || root.dataset.wired === 'true') return;
  root.dataset.wired = 'true';
  root.addEventListener('change', handleChange);
  root.addEventListener('click', handleClick);
}

export function renderCrm(savedLeads = [], activities = []) {
  const summaryEl = document.querySelector('#lbfCrmSummary');
  const board = document.querySelector('#lbfCrmBoard');
  if (!summaryEl || !board) return;
  const pipeline = buildPipeline(savedLeads, activities);
  const s = pipeline.summary;

  summaryEl.innerHTML = [
    ['Open leads', s.open, false],
    ['Proposal value', currency(s.proposalValue), false],
    ['Won value', currency(s.wonValue), false],
    ['Won', s.won, false],
    ['Follow-ups due', s.followupsDue, Boolean(s.followupsDue)]
  ].map(([label, value, due]) => `<div class="lbf-crm-metric${due ? ' due' : ''}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');

  board.innerHTML = CRM_STAGES.map((stage) => {
    const leads = pipeline.stages[stage.id] || [];
    return `<section class="lbf-crm-column" data-stage="${stage.id}"><div class="lbf-crm-column-head"><b>${escapeHtml(stage.label)}</b><span class="lbf-crm-count">${leads.length}</span></div>${leads.length ? leads.map(renderCard).join('') : '<div class="lbf-crm-empty">No leads in this stage.</div>'}</section>`;
  }).join('');
}

async function handleChange(event) {
  const select = event.target.closest('[data-crm-stage]');
  if (!select) return;
  select.disabled = true;
  try {
    await setCrmStage(select.dataset.crmStage, select.value);
    await callbacks.reload();
  } catch (error) {
    callbacks.showMessage(error.message || 'CRM stage could not be updated.');
  } finally {
    select.disabled = false;
  }
}

async function handleClick(event) {
  const target = event.target.closest('[data-crm-action]');
  if (!target) return;
  const action = target.dataset.crmAction;
  const businessId = target.dataset.businessId || '';
  try {
    if (action === 'refresh') {
      await callbacks.reload();
      return;
    }
    if (action === 'next-action') {
      const text = prompt('What is the next action?', 'Follow up with the business');
      if (!text) return;
      const dueAt = prompt('Due date (YYYY-MM-DD). Leave blank if no date.', '') || '';
      await setNextAction(businessId, text, dueAt);
    } else if (action === 'followup') {
      const channel = prompt('Follow-up channel', 'WhatsApp');
      if (!channel) return;
      const note = prompt('Follow-up note (optional)', '') || '';
      await logFollowup(businessId, channel, note);
    } else if (action === 'won') {
      await markLeadWon(businessId);
    } else if (action === 'lost') {
      const reason = prompt('Reason lost (optional)', '') || '';
      await markLeadLost(businessId, reason);
    }
    await callbacks.reload();
  } catch (error) {
    callbacks.showMessage(error.message || 'The CRM action could not be saved.');
  }
}

function renderCard(lead) {
  const business = lead.business || {};
  const name = business.name || 'Saved business';
  const options = CRM_STAGES.map((stage) => `<option value="${stage.id}" ${stage.id === lead.stage ? 'selected' : ''}>${escapeHtml(stage.label)}</option>`).join('');
  const proposalUrl = lead.proposalUrl ? new URL(lead.proposalUrl, location.origin).href : '';
  const next = lead.nextAction;
  return `<article class="lbf-crm-card">
    <h4>${escapeHtml(name)}</h4>
    <small>${escapeHtml(business.category || 'Local business')}</small>
    ${lead.projectFee ? `<div class="lbf-crm-value">${currency(lead.projectFee)}</div>` : ''}
    <select aria-label="CRM stage for ${escapeHtml(name)}" data-crm-stage="${escapeHtml(lead.businessId)}">${options}</select>
    ${next ? `<div class="lbf-crm-next${next.overdue ? ' overdue' : ''}"><b>Next:</b> ${escapeHtml(next.text || 'Follow up')}${next.dueAt ? `<br>${escapeHtml(next.dueAt)}` : ''}</div>` : ''}
    <div class="lbf-crm-card-actions">
      <a class="primary" href="/proposal-builder/?lead=${encodeURIComponent(lead.savedLead.id)}" target="_blank" rel="noopener noreferrer">${lead.proposal ? 'New Proposal' : 'Create Proposal'}</a>
      ${proposalUrl ? `<a href="${escapeHtml(proposalUrl)}" target="_blank" rel="noopener noreferrer">View Proposal</a>` : ''}
      <button type="button" data-crm-action="next-action" data-business-id="${escapeHtml(lead.businessId)}">Next action</button>
      <button type="button" data-crm-action="followup" data-business-id="${escapeHtml(lead.businessId)}">Log follow-up</button>
      ${lead.stage !== 'won' ? `<button type="button" data-crm-action="won" data-business-id="${escapeHtml(lead.businessId)}">Won</button>` : ''}
      ${lead.stage !== 'lost' ? `<button type="button" data-crm-action="lost" data-business-id="${escapeHtml(lead.businessId)}">Lost</button>` : ''}
    </div>
  </article>`;
}

function currency(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `₹${Math.round(number).toLocaleString('en-IN')}` : '₹0';
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
