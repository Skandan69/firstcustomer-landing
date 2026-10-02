const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const safeUrl = (value = '') => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };
const phoneDigits = (value = '') => String(value).replace(/\D/g, '');

export function renderBusinessCard(business, auditState = null) {
  const website = safeUrl(business.website);
  const sourceUrl = safeUrl(business.sourceUrl);
  const phone = business.phone;
  const digits = phoneDigits(phone);
  const sourceLabel = business.provider === 'google' ? 'Google Places' : 'OpenStreetMap';
  const ratingSummary = business.provider === 'openstreetmap' ? 'Rating unavailable from Open Data' : business.rating === null ? 'Rating not available' : `${escapeHtml(business.rating)} ★${business.reviewCount === null ? '' : ` · ${escapeHtml(business.reviewCount)} reviews`}`;
  const key = `${business.provider}:${business.providerId}`;
  const hasAudit = Boolean(auditState);
  const websiteBadge = auditState?.status === 'ready' ? `Website Health ${auditState.audit.healthScore}/100` : 'Website Available — Not Audited';
  return `<article class="lbf-card${hasAudit ? ' lbf-card-auditing' : ''}">
    <div class="lbf-card-head"><div><h3>${escapeHtml(business.name || 'Unnamed business')}</h3><div class="lbf-category">${escapeHtml(business.category || 'Local business')}</div></div><div class="lbf-rating">${ratingSummary}</div></div>
    <div class="lbf-meta"><div>${escapeHtml(business.address || 'Address unavailable')}</div><div>${phone ? escapeHtml(phone) : 'No public phone'}</div><div>${website ? `<a href="${escapeHtml(website)}" target="_blank" rel="noopener noreferrer">${escapeHtml(business.website)}</a>` : 'No website'}</div>${business.openingHours ? `<div>Opening hours: ${escapeHtml(business.openingHours)}</div>` : ''}</div>
    <div class="lbf-badges"><span class="lbf-badge lbf-source-badge">${sourceLabel}</span>${business.matchedCategory ? `<span class="lbf-badge lbf-match-badge" title="${escapeHtml(business.matchReason || '')}">Matched: ${escapeHtml(business.category || business.matchedCategory)}${business.matchConfidence === null || business.matchConfidence === undefined ? '' : ` · ${Math.round(Number(business.matchConfidence) * 100)}%`}</span>` : ''}<span class="lbf-badge ${auditState?.status === 'ready' ? 'available' : website ? 'unknown' : 'no-website'}">${website ? escapeHtml(websiteBadge) : 'No Website'}</span>${business.businessStatus ? `<span class="lbf-badge operational">${escapeHtml(formatStatus(business.businessStatus))}</span>` : ''}</div>
    <div class="lbf-actions">${sourceUrl ? `<a class="lbf-action primary" data-view-business="${escapeHtml(key)}" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">View source</a>` : ''}${digits ? `<a class="lbf-action" href="tel:${digits}">Call</a><a class="lbf-action" href="https://wa.me/${digits}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ''}<button class="lbf-action" type="button" data-save-business="${escapeHtml(key)}">Save Lead</button><button class="lbf-action" type="button" data-audit-business="${escapeHtml(key)}" ${website ? '' : 'disabled title="No website is available to audit"'}>${auditState?.status === 'loading' ? 'Auditing…' : auditState?.status === 'ready' ? 'View Website Intelligence' : 'Audit Website'}</button></div>
    ${renderAuditState(auditState, key)}
  </article>`;
}

export function renderWebsiteAudit(audit, cached, key) {
  const sections = [
    ['Website Health', [
      ['Reachable', yesNo(audit.health.reachable)], ['HTTPS', yesNo(audit.health.https)], ['SSL present', yesNo(audit.health.sslPresence)], ['HTTP status', audit.health.httpStatus || 'Unavailable'], ['Redirects', audit.health.redirects?.length || 0], ['robots.txt', foundLabel(audit.health.robotsTxt)], ['sitemap.xml', foundLabel(audit.health.sitemapXml)]
    ]],
    ['SEO', [['Title', audit.seo.title || 'Missing'], ['Meta description', audit.seo.metaDescription || 'Missing'], ['Canonical', audit.seo.canonical || 'Missing'], ['H1 count', audit.seo.h1Count], ['H2 count', audit.seo.h2Count], ['Open Graph', yesNo(audit.seo.openGraph)], ['Twitter Cards', yesNo(audit.seo.twitterCards)], ['Structured data', audit.seo.structuredData ? `${audit.seo.structuredDataBlocks} block(s)` : 'Not detected']]],
    ['Conversion', [['Phone', yesNo(audit.conversion.phone)], ['WhatsApp', yesNo(audit.conversion.whatsapp)], ['Contact form', yesNo(audit.conversion.contactForm)], ['Email', yesNo(audit.conversion.email)], ['Booking', yesNo(audit.conversion.booking)], ['CTA buttons', audit.conversion.ctaButtons], ['Testimonials', yesNo(audit.conversion.testimonials)], ['FAQ', yesNo(audit.conversion.faq)], ['Google Maps', yesNo(audit.conversion.googleMaps)]]],
    ['Trust', [['Privacy policy', yesNo(audit.trust.privacyPolicy)], ['Terms', yesNo(audit.trust.terms)], ['Copyright', yesNo(audit.trust.copyright)], ['Social links', audit.trust.socialLinks?.length ? audit.trust.socialLinks.join(', ') : 'Not detected']]],
    ['Accessibility', [['Images missing alt text', `${audit.accessibility.imagesMissingAlt} of ${audit.accessibility.imageCount}`], ['Heading hierarchy issues', audit.accessibility.headingHierarchyIssues], ['Unlabelled form controls', `${audit.accessibility.unlabeledFormControls} of ${audit.accessibility.formControlCount}`]]]
  ];
  return `<details class="lbf-intelligence" open><summary><span>Website Intelligence</span><span class="lbf-score">${escapeHtml(audit.opportunityScore)} opportunity · ${escapeHtml(audit.healthScore)} health</span></summary>
    <div class="lbf-intelligence-meta"><span>${cached ? 'Recent saved audit' : 'New audit'} · ${escapeHtml(formatDate(audit.auditedAt))}</span><button type="button" data-refresh-audit="${escapeHtml(key)}">Refresh audit</button></div>
    <div class="lbf-audit-sections">${sections.map(([title, rows], index) => `<details ${index === 0 ? 'open' : ''}><summary>${escapeHtml(title)}</summary><dl>${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl></details>`).join('')}</div>
    <section class="lbf-recommendations"><h4>Recommendations</h4>${audit.recommendations?.length ? audit.recommendations.map((item) => `<article><span class="lbf-priority ${escapeHtml(item.priority)}">${escapeHtml(item.priority)}</span><div><strong>${escapeHtml(item.found)}</strong><p><b>Why it matters:</b> ${escapeHtml(item.why)}</p><p><b>Suggested improvement:</b> ${escapeHtml(item.improvement)}</p></div></article>`).join('') : '<p>No rule-based recommendations were generated.</p>'}</section>
  </details>`;
}

export function renderState(type, title, message) { return `<div class="lbf-state">${type === 'loading' ? '<div class="lbf-spinner"></div>' : '<div class="lbf-state-icon">⌖</div>'}<h3>${escapeHtml(title)}</h3><p>${escapeHtml(message)}</p></div>`; }
export function businessNoResultsMessage(criteria={},categoryMatch=null){if(criteria.provider==='google')return'Google Places returned no matching businesses. Try a nearby location, another category, or a larger radius.';if(criteria.provider==='open_data'&&!criteria.category)return'Open Data returned no matching businesses. Try a nearby location or a larger radius.';if(!criteria.category)return'No businesses were returned. Try a nearby location or a larger radius.';if(categoryMatch?.bestEffort)return`No confident Open Data matches were found for “${criteria.category}”. Try a suggested category or another location.`;return`No relevant ${categoryMatch?.label||criteria.category} results were found in this area. Zero relevant results are shown instead of unrelated places.`;}

export function providerErrorPresentation(error={}){
  const messages={
    GOOGLE_PERMISSION_DENIED:['Google Places permission denied','Check the key project, API restrictions, and Places API (New) access.'],
    GOOGLE_BILLING_REQUIRED:['Google Places billing unavailable','Check the Google Cloud billing account and billing linkage.'],
    GOOGLE_API_KEY_REJECTED:['Google Places API key rejected','Check the deployed key and its Google API restrictions.'],
    GOOGLE_QUOTA_EXCEEDED:['Google Places quota exceeded','Try again later or review the Google Cloud quota.'],
    GOOGLE_API_NOT_ENABLED:['Google Places API unavailable','Enable Places API (New) in the deployed key project.'],
    GOOGLE_NOT_CONFIGURED:['Google Places is not configured','Add GOOGLE_PLACES_API_KEY to this deployment.'],
    OPEN_DATA_TIMEOUT:['Open Data timed out','Open Data search timed out. Please try again.'],
    AUTO_FALLBACK_FAILED:['Business providers unavailable',error.message||'Google Places failed and the Open Data fallback was also unavailable.']
  };
  if(messages[error.code])return{title:messages[error.code][0],message:messages[error.code][1]};
  if(error.requestedProvider==='google'||error.provider==='google')return{title:'Google Places unavailable',message:error.message||'Google Places could not complete this search.'};
  if(error.requestedProvider==='open_data'||error.provider==='open_data')return{title:'Open Data unavailable',message:error.message||'Open Data could not complete this search.'};
  return{title:'Search temporarily unavailable',message:error.message||'Please try again shortly.'};
}
function renderAuditState(state, key) {
  if (!state) return '';
  if (state.status === 'loading') return '<section class="lbf-intelligence lbf-audit-loading" role="status"><div class="lbf-spinner"></div><p>Inspecting the website and checking public files…</p></section>';
  if (state.status === 'error') return `<section class="lbf-intelligence lbf-audit-error" role="alert"><strong>Audit unavailable</strong><p>${escapeHtml(state.message)}</p><button class="lbf-action" type="button" data-refresh-audit="${escapeHtml(key)}">Try again</button></section>`;
  if (state.status === 'ready') return renderWebsiteAudit(state.audit, state.cached, key);
  return '';
}
function yesNo(value) { return value ? 'Detected' : 'Not detected'; }
function foundLabel(value) { return value?.found ? `Found (${value.status})` : value?.status ? `Not found (${value.status})` : 'Not found'; }
function formatStatus(value) { return String(value).toLowerCase().replace(/_/g, ' ').replace(/^./, (character) => character.toUpperCase()); }
function formatDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Recently' : date.toLocaleString(); }
