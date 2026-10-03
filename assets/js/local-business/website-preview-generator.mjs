const GROUPS = [
  { match: /dentist|doctor|clinic|hospital|pharmacy/i, theme: 'care', label: 'Healthcare', services: ['Consultations & enquiries', 'Customer-friendly information', 'Easy contact & location access'] },
  { match: /restaurant|cafe|bakery|hotel/i, theme: 'hospitality', label: 'Hospitality', services: ['Signature offerings', 'Location & opening information', 'Reservations & enquiries'] },
  { match: /plumber|electrician|painter|pest|waterproof|car repair/i, theme: 'service', label: 'Local Services', services: ['Core service overview', 'Fast enquiry path', 'Service area & contact'] },
  { match: /lawyer|accountant|real estate/i, theme: 'professional', label: 'Professional Services', services: ['Expertise overview', 'Consultation enquiries', 'Trust & contact information'] },
  { match: /gym|spa|beauty|salon/i, theme: 'wellness', label: 'Wellness', services: ['Experience overview', 'Appointments & enquiries', 'Location & contact'] },
  { match: /school|college/i, theme: 'education', label: 'Education', services: ['Programs overview', 'Admissions enquiries', 'Campus & contact information'] },
  { match: /store|shop|grocery|furniture|electronics|clothing/i, theme: 'retail', label: 'Retail', services: ['Product highlights', 'Visit or enquiry options', 'Location & contact'] }
];

export function buildWebsitePreview(business = {}, audit = null, opportunity = null) {
  const name = clean(business.name, 100) || 'Local Business';
  const category = clean(business.category, 80) || 'Local Business';
  const address = clean(business.address, 180);
  const location = clean(business.city || business.state || address, 100);
  const phone = clean(business.phone, 40);
  const email = clean(business.email, 120);
  const website = safeUrl(business.website);
  const group = GROUPS.find((item) => item.match.test(category)) || { theme: 'modern', label: category, services: ['What we offer', 'Why customers choose us', 'Contact & location'] };
  const rating = numberOrNull(business.rating);
  const reviewCount = integerOrNull(business.reviewCount);
  const auditReasons = Array.isArray(opportunity?.reasons) ? opportunity.reasons.slice(0, 3).map((item) => clean(item, 120)).filter(Boolean) : [];

  return {
    version: 1,
    theme: group.theme,
    business: { name, category, address, location, phone, email, website, rating, reviewCount },
    hero: {
      eyebrow: group.label,
      title: name,
      subtitle: location
        ? `A clearer, mobile-first way for customers in ${location} to discover, trust and contact ${name}.`
        : `A clearer, mobile-first way for customers to discover, trust and contact ${name}.`,
      primaryCta: phone ? 'Call now' : email ? 'Email us' : 'Get in touch',
      secondaryCta: 'Explore'
    },
    proof: [
      rating !== null ? { value: `${rating.toFixed(1)}★`, label: reviewCount !== null ? `${reviewCount} public reviews` : 'Public rating' } : null,
      address ? { value: 'Local', label: location || 'Easy to find' } : null,
      { value: 'Mobile', label: 'Clear contact experience' }
    ].filter(Boolean),
    services: group.services.map((title) => ({ title, description: sampleDescription(title, category) })),
    story: {
      title: `A stronger digital first impression for ${name}`,
      body: `This concept focuses on the information customers usually need first: what the business does, why they should enquire, and how to make contact without friction.`
    },
    contact: { title: 'Ready to talk?', phone, email, address, location },
    auditContext: audit ? {
      healthScore: boundedScore(audit.healthScore),
      opportunityScore: boundedScore(audit.opportunityScore),
      reasons: auditReasons
    } : null,
    disclaimer: 'Concept preview only. Services, claims, images and business details must be confirmed with the business before publication.',
    generatedAt: new Date().toISOString()
  };
}

function sampleDescription(title, category) {
  if (/contact|enquir|appointment|reservation|admission/i.test(title)) return 'Give customers one obvious next step with a prominent call-to-action and minimal friction.';
  if (/location|area|campus|visit/i.test(title)) return 'Make address, operating area and contact information easy to find on every device.';
  if (/trust|why|experience/i.test(title)) return 'Use verified business information, real customer proof and clear expectations to build trust.';
  if (/product|offering|service|program|expertise|care/i.test(title)) return `Present the most important ${category.toLowerCase()} offerings in a simple, scannable section. Confirm the exact offerings before publishing.`;
  return 'Use concise, verified information that helps customers understand the business and take the next step.';
}

function clean(value, max) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function safeUrl(value) { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } }
function numberOrNull(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function integerOrNull(value) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : null; }
function boundedScore(value) { const n = Number(value); return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : null; }
