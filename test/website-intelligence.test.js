const test = require('node:test');
const assert = require('node:assert/strict');
const { analyseHtml } = require('../api/website-intelligence/parser');
const { scoreAudit } = require('../api/website-intelligence/scoring');
const { auditWebsite } = require('../api/website-intelligence/audit');
const { isPrivateAddress, validatePublicUrl } = require('../api/website-intelligence/fetcher');
const repository = require('../api/website-intelligence/repository');
const handler = require('../api/website-audits');

const WORKSPACE = '123e4567-e89b-42d3-a456-426614174000';
const COMPLETE_HTML = `<!doctype html><html><head>
  <title>Alpha Dental Clinic Hyderabad</title>
  <meta name="description" content="Trusted local dental care and appointments.">
  <meta property="og:title" content="Alpha Dental"><meta name="twitter:card" content="summary">
  <link rel="canonical" href="https://alpha.example/"><script type="application/ld+json">{"@type":"LocalBusiness"}</script>
  </head><body><h1>Alpha Dental</h1><h2>Our services</h2><img src="team.jpg" alt="Dental team">
  <a href="tel:+914012345678">Call now</a><a href="https://wa.me/914012345678">WhatsApp</a>
  <a href="mailto:care@alpha.example">Email</a><a href="/book">Book appointment</a>
  <form><label for="name">Name</label><input id="name"></form><button>Get a quote</button>
  <section>Testimonials from customers</section><section>Frequently Asked Questions</section>
  <a href="https://maps.google.com/x">Map</a><a href="/privacy">Privacy Policy</a><a href="/terms">Terms</a>
  <a href="https://instagram.com/alpha">Instagram</a><footer>© 2026 Alpha Dental</footer></body></html>`;

test('website parser detects SEO, conversion, trust, and accessible markup', () => {
  const result = analyseHtml(COMPLETE_HTML);
  assert.equal(result.seo.title, 'Alpha Dental Clinic Hyderabad');
  assert.equal(result.seo.h1Count, 1);
  assert.equal(result.seo.structuredDataBlocks, 1);
  assert.equal(result.conversion.phone, true);
  assert.equal(result.conversion.whatsapp, true);
  assert.equal(result.conversion.contactForm, true);
  assert.equal(result.conversion.ctaButtons > 0, true);
  assert.equal(result.trust.privacyPolicy, true);
  assert.deepEqual(result.trust.socialLinks, ['instagram.com']);
  assert.equal(result.accessibility.imagesMissingAlt, 0);
  assert.equal(result.accessibility.unlabeledFormControls, 0);
});

test('website parser reports missing fields and accessibility gaps', () => {
  const result = analyseHtml('<html><body><h1>Welcome</h1><h3>Details</h3><img src="x"><form><input id="email"></form></body></html>');
  assert.equal(result.seo.metaDescription, '');
  assert.equal(result.conversion.email, false);
  assert.equal(result.accessibility.imagesMissingAlt, 1);
  assert.equal(result.accessibility.headingHierarchyIssues, 1);
  assert.equal(result.accessibility.unlabeledFormControls, 1);
});

test('opportunity scoring is deterministic and recommendations are explainable', () => {
  const parsed = analyseHtml('<html><head><title>Only a title</title></head><body><h1>Hello</h1></body></html>');
  const result = scoreAudit({ health: { reachable: true, https: true, httpStatus: 200, robotsTxt: { found: false }, sitemapXml: { found: false } }, ...parsed });
  assert.equal(Number.isInteger(result.opportunityScore), true);
  assert.equal(result.healthScore, 100 - result.opportunityScore);
  assert.ok(result.recommendations.length > 5);
  assert.ok(result.recommendations.every((item) => item.found && item.why && item.improvement));
});

test('audit engine inspects the page, robots, sitemap, redirects, and status', async () => {
  const calls = [];
  const request = async (url) => {
    calls.push(url);
    if (url.endsWith('/robots.txt')) return { url, status: 200, body: 'User-agent: *', redirects: [] };
    if (url.endsWith('/sitemap.xml')) return { url, status: 404, body: '', redirects: [] };
    return { url: 'https://alpha.example/', status: 200, body: COMPLETE_HTML, redirects: [{ from: 'http://alpha.example/', to: 'https://alpha.example/', status: 301 }] };
  };
  const audit = await auditWebsite('http://alpha.example/', { request, now: () => new Date('2026-07-13T00:00:00Z') });
  assert.equal(audit.health.reachable, true);
  assert.equal(audit.health.https, true);
  assert.equal(audit.health.redirects.length, 1);
  assert.equal(audit.health.robotsTxt.found, true);
  assert.equal(audit.health.sitemapXml.found, false);
  assert.equal(calls.length, 3);
});

test('SSRF protection rejects private and nonstandard targets', async () => {
  assert.equal(isPrivateAddress('127.0.0.1'), true);
  assert.equal(isPrivateAddress('10.0.0.1'), true);
  assert.equal(isPrivateAddress('::ffff:172.16.0.1'), true);
  assert.equal(isPrivateAddress('8.8.8.8'), false);
  await assert.rejects(validatePublicUrl('http://127.0.0.1'), { code: 'UNSAFE_WEBSITE_URL' });
  await assert.rejects(validatePublicUrl('https://example.com:8443', async () => ['8.8.8.8']), { code: 'UNSAFE_WEBSITE_URL' });
});

test('audit persistence returns recent summaries and upserts server-side', async () => {
  process.env.SUPABASE_URL = 'https://database.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_server-only';
  const oldFetch = global.fetch;
  const calls = [];
  const summary = { requestedUrl: 'https://alpha.example/', auditedAt: '2026-07-13T00:00:00Z', opportunityScore: 20, healthScore: 80 };
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (options.method === 'GET') return response([{ summary, audited_at: '2026-07-13T00:00:00Z' }]);
    return response([{ id: 'audit-1', summary }]);
  };
  try {
    const cached = await repository.findRecent(WORKSPACE, 'https://alpha.example/', new Date('2026-07-13T01:00:00Z').getTime());
    assert.deepEqual(cached, summary);
    await repository.saveAudit(WORKSPACE, { provider: 'google', providerId: 'g1', name: 'Alpha' }, summary);
    const savedBody = JSON.parse(calls[1].options.body);
    assert.equal(savedBody.workspace_id, WORKSPACE);
    assert.equal(savedBody.business_provider_id, 'g1');
    assert.equal(JSON.stringify(savedBody).includes('sb_secret_server-only'), false);
  } finally { global.fetch = oldFetch; }
});

test('audit route validates methods, JSON, size, workspace, and unsafe URLs', async () => {
  let out = mockResponse(); await handler({ method: 'GET', headers: {}, query: {} }, out); assert.equal(out.statusCode, 405);
  out = mockResponse(); await handler(request('POST', '{bad'), out); assert.equal(out.statusCode, 400); assert.equal(out.body.error.code, 'INVALID_JSON');
  out = mockResponse(); await handler(request('POST', JSON.stringify({ website: `https://example.com/${'x'.repeat(17000)}` })), out); assert.equal(out.statusCode, 413);
  out = mockResponse(); await handler({ ...request('POST', { website: 'https://example.com' }), headers: {} }, out); assert.equal(out.statusCode, 400);
  out = mockResponse(); await handler(request('POST', { website: 'http://127.0.0.1' }), out); assert.equal(out.statusCode, 400); assert.equal(out.body.error.code, 'UNSAFE_WEBSITE_URL');
});

test('recent persisted audits are reused unless refresh is explicit', async () => {
  const engineModule = require('../api/website-intelligence/audit');
  const oldFind = repository.findRecent;
  const oldSave = repository.saveAudit;
  const oldAudit = engineModule.auditWebsite;
  let auditRuns = 0; let saves = 0;
  const summary = { requestedUrl: 'https://8.8.8.8/', auditedAt: '2026-07-13T00:00:00Z', opportunityScore: 10, healthScore: 90 };
  repository.findRecent = async () => summary;
  repository.saveAudit = async () => { saves += 1; };
  engineModule.auditWebsite = async () => { auditRuns += 1; return summary; };
  try {
    let out = mockResponse(); await handler(request('POST', { website: 'https://8.8.8.8/' }), out);
    assert.equal(out.statusCode, 200); assert.equal(out.body.cached, true); assert.equal(auditRuns, 0);
    out = mockResponse(); await handler(request('POST', { website: 'https://8.8.8.8/', refresh: true }), out);
    assert.equal(out.statusCode, 200); assert.equal(out.body.cached, false); assert.equal(auditRuns, 1); assert.equal(saves, 1);
  } finally { repository.findRecent = oldFind; repository.saveAudit = oldSave; engineModule.auditWebsite = oldAudit; }
});

test('audit rendering escapes website content and exposes refresh control', async () => {
  const { renderWebsiteAudit } = await import('../assets/js/local-business/business-renderer.mjs');
  const parsed = analyseHtml(COMPLETE_HTML);
  const base = { version: 1, requestedUrl: 'https://alpha.example/', finalUrl: 'https://alpha.example/', auditedAt: '2026-07-13T00:00:00Z', health: { reachable: true, https: true, sslPresence: true, httpStatus: 200, redirects: [], robotsTxt: { found: true, status: 200 }, sitemapXml: { found: true, status: 200 } }, ...parsed };
  const scored = { ...base, ...scoreAudit(base), recommendations: [{ section: 'seo', priority: 'high', found: '<img onerror=alert(1)>', why: '<script>x</script>', improvement: 'Add a title' }] };
  const html = renderWebsiteAudit(scored, true, 'google:g1');
  assert.equal(html.includes('<img onerror'), false);
  assert.equal(html.includes('<script>'), false);
  assert.match(html, /data-refresh-audit="google:g1"/);
  assert.match(html, /Recent saved audit/);
});

function request(method, body) { return { method, body, headers: { 'x-workspace-id': WORKSPACE, 'x-forwarded-for': `audit-test-${Math.random()}` }, socket: {} }; }
function mockResponse() { return { statusCode: 200, body: null, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }
function response(data, status = 200) { return { ok: status >= 200 && status < 300, status, json: async () => data }; }
