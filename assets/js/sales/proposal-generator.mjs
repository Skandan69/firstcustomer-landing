const PACKAGES = Object.freeze({
  website: { name: 'Business Website', price: 12000, timeline: '7–10 working days', deliverables: ['Responsive business website', 'Clear service and contact sections', 'Mobile-first enquiry flow', 'Basic on-page SEO setup', 'Launch support'] },
  redesign: { name: 'Website Redesign', price: 18000, timeline: '10–14 working days', deliverables: ['Conversion-focused website redesign', 'Mobile UX improvements', 'Clear calls-to-action', 'Trust and contact improvements', 'Basic on-page SEO cleanup', 'Launch support'] },
  growth: { name: 'Website + Local SEO', price: 26000, timeline: '14–21 working days', deliverables: ['Website redesign or new website', 'Local SEO foundations', 'On-page SEO for core services', 'Conversion-focused contact flow', 'Technical hygiene improvements', 'Launch and handover'] },
  optimize: { name: 'Website Optimization', price: 15000, timeline: '7–12 working days', deliverables: ['Conversion and UX improvements', 'SEO and metadata cleanup', 'CTA and contact-flow improvements', 'Trust and accessibility fixes', 'Performance-focused cleanup'] }
});

export function recommendedPackage(business = {}, opportunity = {}) {
  const service = String(opportunity.recommendedService || '').toLowerCase();
  if (!business.website) return 'website';
  if (service.includes('seo')) return 'growth';
  if (service.includes('redesign') || service.includes('modernization')) return 'redesign';
  return 'optimize';
}

export function buildProposal({ business = {}, opportunity = {}, previewUrl = '', packageId, projectFee, depositPercent = 50, timeline, validityDays = 14, note = '' } = {}) {
  const id = PACKAGES[packageId] ? packageId : recommendedPackage(business, opportunity);
  const selected = PACKAGES[id];
  const fee = money(projectFee, selected.price);
  const deposit = clampNumber(depositPercent, 0, 100, 50);
  const validity = Math.trunc(clampNumber(validityDays, 1, 90, 14));
  const safeBusiness = {
    name: clean(business.name, 120) || 'Business',
    category: clean(business.category, 80),
    address: clean(business.address, 180),
    city: clean(business.city || business.state, 100),
    website: safeHttpUrl(business.website),
    phone: clean(business.phone, 40),
    email: clean(business.email, 120),
    rating: nullableNumber(business.rating),
    reviewCount: nullableInteger(business.reviewCount)
  };
  const reasons = Array.isArray(opportunity.reasons) ? opportunity.reasons.slice(0, 4).map((item) => clean(item, 180)).filter(Boolean) : [];
  const observed = reasons.length ? reasons : [safeBusiness.website ? 'Website available for improvement review' : 'No public website was listed in the lead data'];
  const demo = safeHttpUrl(previewUrl);

  return {
    version: 1,
    business: safeBusiness,
    title: `Digital Growth Proposal for ${safeBusiness.name}`,
    preparedAt: new Date().toISOString(),
    validUntil: new Date(Date.now() + validity * 86400000).toISOString(),
    summary: `This proposal outlines a practical digital presence project for ${safeBusiness.name}. The scope is based on public business information and the opportunity signals available in FirstCustomer. Final services, content, branding, integrations, and technical requirements should be confirmed before work begins.`,
    observed,
    package: { id, name: clean(selected.name, 80), timeline: clean(timeline, 80) || selected.timeline, deliverables: selected.deliverables.map((item) => clean(item, 140)) },
    pricing: {
      currency: 'INR',
      projectFee: fee,
      depositPercent: deposit,
      depositAmount: Math.round(fee * deposit / 100),
      balanceAmount: Math.max(0, fee - Math.round(fee * deposit / 100))
    },
    previewUrl: demo,
    note: clean(note, 600),
    terms: [
      'Final scope is confirmed before project start.',
      'Client supplies or approves business facts, services, branding assets and legal content.',
      'Third-party subscriptions, domains, hosting and paid provider fees are excluded unless explicitly added.',
      'Timeline starts after required content, access and deposit are received.',
      'Any work outside the agreed scope is quoted separately.'
    ],
    disclaimer: 'Proposal generated from structured lead data. Verify all business details and commercial terms before sending.'
  };
}

export function formatInr(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '₹0';
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

export const PROPOSAL_PACKAGES = PACKAGES;

function clean(value, max) { return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : ''; }
function safeHttpUrl(value) { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } }
function money(value, fallback) { const n = Number(value); return Number.isFinite(n) && n >= 0 && n <= 10000000 ? Math.round(n) : fallback; }
function clampNumber(value, min, max, fallback) { const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; }
function nullableNumber(value) { if (value === null || value === undefined || value === '') return null; const n = Number(value); return Number.isFinite(n) ? n : null; }
function nullableInteger(value) { const n = nullableNumber(value); return n === null ? null : Math.max(0, Math.trunc(n)); }
