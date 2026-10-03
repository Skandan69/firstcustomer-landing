export function buildOutreachMessage(business = {}, opportunity = {}, previewUrl = '') {
  const name = clean(business.name, 100) || 'there';
  const category = clean(business.category, 70).toLowerCase();
  const location = clean(business.city || business.state, 80);
  const reason = clean(opportunity.reasons?.[0], 140) || (!business.website ? 'I could not find a website listed for the business' : 'there may be room to improve the online customer experience');
  const demand = demandProof(business);
  const context = [category ? `${category} businesses` : 'local businesses', location ? `in ${location}` : 'in the area'].join(' ');
  const demo = safeHttpUrl(previewUrl);

  const parts = [
    `Hi ${name} — I came across your business while researching ${context}.`,
    demand,
    `I noticed ${lowerFirst(reason)}.`,
    demo
      ? `I put together a no-obligation website concept to show what a clearer customer experience could look like: ${demo}`
      : `If useful, I can put together a quick website concept showing how the customer journey could be improved.`,
    `If it looks useful, I can tailor it to your real services, branding and preferred contact flow.`
  ].filter(Boolean);

  return parts.join(' ');
}

export function buildCallOpening(business = {}, opportunity = {}) {
  const name = clean(business.name, 100) || 'your business';
  const reason = clean(opportunity.reasons?.[0], 120) || 'a few opportunities in the online customer journey';
  return `Hi, I was looking at ${name} and noticed ${lowerFirst(reason)}. I work on improving business websites and customer enquiry flows. I have a quick concept I can show you — would it be okay if I send the link?`;
}

function demandProof(business) {
  const rating = Number(business.rating);
  const reviews = Number(business.reviewCount);
  if (Number.isFinite(rating) && Number.isFinite(reviews) && reviews >= 20 && rating >= 4) {
    return `You already have strong public customer proof with ${rating.toFixed(1)}★ across ${Math.trunc(reviews)} reviews.`;
  }
  return '';
}
function safeHttpUrl(value) { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } }
function clean(value, max) { return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : ''; }
function lowerFirst(value) { const text = String(value || ''); return text ? text[0].toLowerCase() + text.slice(1) : text; }
