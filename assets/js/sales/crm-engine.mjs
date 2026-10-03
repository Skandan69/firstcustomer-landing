export const CRM_STAGES = Object.freeze([
  { id: 'new', label: 'New', order: 0 },
  { id: 'contacted', label: 'Contacted', order: 1 },
  { id: 'interested', label: 'Interested', order: 2 },
  { id: 'demo', label: 'Demo / Audit', order: 3 },
  { id: 'proposal', label: 'Proposal', order: 4 },
  { id: 'won', label: 'Won', order: 5 },
  { id: 'lost', label: 'Lost', order: 6 }
]);

const VALID_STAGES = new Set(CRM_STAGES.map((stage) => stage.id));

export function buildPipeline(savedLeads = [], activities = [], now = Date.now()) {
  const byBusiness = groupActivities(activities);
  const leads = savedLeads.map((savedLead) => {
    const business = savedLead.businesses || {};
    const businessId = savedLead.business_id || business.id || '';
    const events = byBusiness.get(businessId) || [];
    const stage = deriveStage(events);
    const nextAction = latestMetadata(events, 'crm_next_action_set');
    const proposalEvent = latestEvent(events, 'proposal_generated');
    const proposalResponse = latestMetadata(events, 'proposal_response');
    const proposal = proposalEvent?.metadata?.proposal || null;
    const proposalUrl = proposalEvent?.metadata?.shareToken ? `/proposal/?token=${encodeURIComponent(proposalEvent.metadata.shareToken)}` : '';
    const projectFee = Number(proposal?.pricing?.projectFee) || 0;
    const dueAt = nextAction?.dueAt ? dueTime(nextAction.dueAt) : NaN;
    return {
      savedLead,
      business,
      businessId,
      stage,
      nextAction: nextAction ? { text: String(nextAction.text || ''), dueAt: String(nextAction.dueAt || ''), overdue: Number.isFinite(dueAt) && dueAt < now } : null,
      proposal,
      proposalResponse,
      proposalUrl,
      projectFee,
      events
    };
  });

  const stages = Object.fromEntries(CRM_STAGES.map((stage) => [stage.id, leads.filter((lead) => lead.stage === stage.id)]));
  const open = leads.filter((lead) => !['won','lost'].includes(lead.stage));
  const proposalValue = open.reduce((sum, lead) => sum + lead.projectFee, 0);
  const wonValue = leads.filter((lead) => lead.stage === 'won').reduce((sum, lead) => sum + lead.projectFee, 0);
  const followupsDue = open.filter((lead) => lead.nextAction?.overdue).length;

  return {
    leads,
    stages,
    summary: {
      total: leads.length,
      open: open.length,
      proposals: leads.filter((lead) => lead.stage === 'proposal').length,
      won: leads.filter((lead) => lead.stage === 'won').length,
      lost: leads.filter((lead) => lead.stage === 'lost').length,
      proposalValue,
      wonValue,
      followupsDue,
      clientResponses: leads.filter((lead) => lead.proposalResponse?.response).length
    }
  };
}

export function normalizedStage(value) {
  const stage = String(value || '').toLowerCase();
  return VALID_STAGES.has(stage) ? stage : 'new';
}

export function stageLabel(value) {
  const stage = CRM_STAGES.find((item) => item.id === normalizedStage(value));
  return stage?.label || 'New';
}

function deriveStage(events) {
  let stage = 'new';
  [...events].sort((a, b) => timestamp(a) - timestamp(b)).forEach((event) => {
    if (event.event_type === 'crm_stage_changed') stage = normalizedStage(event.metadata?.stage);
    if (event.event_type === 'proposal_generated' && !['won','lost'].includes(stage)) stage = 'proposal';
    if (event.event_type === 'lead_won') stage = 'won';
    if (event.event_type === 'lead_lost') stage = 'lost';
  });
  return stage;
}

function groupActivities(activities) {
  const map = new Map();
  for (const activity of activities || []) {
    const id = activity?.business_id;
    if (!id) continue;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(activity);
  }
  return map;
}

function latestMetadata(events, eventType) {
  return latestEvent(events, eventType)?.metadata || null;
}
function latestEvent(events, eventType) {
  return [...(events || [])].filter((event) => event.event_type === eventType).sort((a, b) => timestamp(b) - timestamp(a))[0] || null;
}
function dueTime(value) { const text=String(value||''); const date=/^\d{4}-\d{2}-\d{2}$/.test(text)?new Date(`${text}T23:59:59`):new Date(text); const time=date.getTime(); return Number.isFinite(time)?time:NaN; }
function timestamp(event) {
  const value = new Date(event?.created_at || 0).getTime();
  return Number.isFinite(value) ? value : 0;
}
