const LEVELS = Object.freeze({
  high: { label: 'High priority', min: 70 },
  medium: { label: 'Worth reviewing', min: 45 },
  low: { label: 'Lower priority', min: 0 }
});

export function evaluateOpportunity(business = {}, audit = null) {
  const reasons = [];
  const strength = scoreBusinessStrength(business, reasons);
  const digitalGap = scoreDigitalGap(business, audit, reasons);
  const score = clamp(Math.round(strength + digitalGap), 0, 100);
  const level = score >= LEVELS.high.min ? 'high' : score >= LEVELS.medium.min ? 'medium' : 'low';
  return {
    score,
    level,
    label: LEVELS[level].label,
    confidence: confidenceLabel(business, audit),
    recommendedService: recommendedService(business, audit),
    nextAction: nextAction(business, audit),
    reasons: unique(reasons).slice(0, 4)
  };
}

function scoreBusinessStrength(business, reasons) {
  let score = 0;
  const rating = numberOrNull(business.rating);
  const reviews = numberOrNull(business.reviewCount);

  if (business.phone) {
    score += 8;
    reasons.push('Public phone available');
  }

  if (/operational/i.test(String(business.businessStatus || ''))) score += 4;

  if (rating !== null) {
    if (rating >= 4.5) score += 10;
    else if (rating >= 4) score += 7;
    else if (rating >= 3.5) score += 4;
  }

  if (reviews !== null) {
    if (reviews >= 200) score += 15;
    else if (reviews >= 100) score += 13;
    else if (reviews >= 50) score += 10;
    else if (reviews >= 20) score += 7;
    else if (reviews >= 5) score += 3;
  }

  if (rating !== null && reviews !== null && rating >= 4 && reviews >= 20) {
    reasons.push(`Established local demand: ${rating.toFixed(1)}★ from ${Math.trunc(reviews)} reviews`);
  }

  return Math.min(score, 37);
}

function scoreDigitalGap(business, audit, reasons) {
  if (!business.website) {
    reasons.unshift('No website listed');
    return 58;
  }

  if (!audit) {
    reasons.unshift('Website available but not audited yet');
    return 18;
  }

  const auditGap = clamp(Number(audit.opportunityScore) || 0, 0, 100);
  const recommendations = Array.isArray(audit.recommendations) ? audit.recommendations : [];
  recommendations
    .filter((item) => item && item.found)
    .sort((a, b) => (Number(b.weight) || 0) - (Number(a.weight) || 0))
    .slice(0, 2)
    .forEach((item) => reasons.unshift(String(item.found)));

  return Math.round(auditGap * 0.6);
}

function recommendedService(business, audit) {
  if (!business.website) return 'New business website';
  if (!audit) return 'Website audit & conversion review';

  const recommendations = Array.isArray(audit.recommendations) ? audit.recommendations : [];
  const conversionGaps = recommendations.filter((item) => item.section === 'conversion').length;
  const seoGaps = recommendations.filter((item) => item.section === 'seo').length;
  const health = Number(audit.healthScore);

  if (conversionGaps >= 2 && Number(audit.opportunityScore) >= 55) return 'Conversion-focused website redesign';
  if (seoGaps >= 3) return 'Website + local SEO upgrade';
  if (Number.isFinite(health) && health < 60) return 'Website modernization & repair';
  return 'Digital presence optimization';
}

function nextAction(business, audit) {
  if (business.phone && !business.website) return 'Call or WhatsApp and offer a demo website';
  if (business.phone && audit) return 'Contact with the strongest audit finding';
  if (business.phone) return 'Audit the website, then contact the business';
  if (business.website) return 'Audit the website and research owner contact details';
  return 'Save the lead and find a verified owner contact';
}

function confidenceLabel(business, audit) {
  if (audit) return 'High';
  if (business.provider === 'google' && (business.rating !== null || business.reviewCount !== null)) return 'High';
  if (business.provider === 'google') return 'Medium';
  return business.phone || business.website ? 'Medium' : 'Limited';
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }

export const OPPORTUNITY_THRESHOLDS = Object.freeze({ high: 70, medium: 45 });
