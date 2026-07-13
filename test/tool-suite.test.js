const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'tools/index.html'), 'utf8');

function response(data, status = 200) { return { ok: status >= 200 && status < 300, status, json: async () => data }; }
function res() { return { statusCode: 0, body: null, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }

test('all seven visible tools initialize and are honestly classified', () => {
  const tools = ['signal', 'rank', 'yt', 'content', 'leads', 'guide', 'localGigs'];
  for (const id of tools) {
    assert.match(html, new RegExp(`id="nav-${id}"`));
    assert.match(html, new RegExp(`id="page-${id}"`));
    assert.match(html, new RegExp(`setToolStatus\\("${id}"`));
  }
  assert.match(html, /6 workflows and 1 educational guide/);
  assert.match(html, /Static educational content — no live website analysis is claimed/);
});

test('inline scripts parse and shared runtime loads exactly once', () => {
  const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)];
  for (const [, attributes, source] of scripts) if (!/\bsrc=/.test(attributes)) assert.doesNotThrow(() => new vm.Script(source));
  assert.equal((html.match(/\/assets\/js\/tool-suite-runtime\.js/g) || []).length, 1);
});

test('browser code never reads or sends legacy paid keys or calls paid providers directly', () => {
  for (const value of ['fc_ant', 'fc_goog', 'fc_gcx', 'fc_serp', 'api.anthropic.com', 'serpapi.com/search', 'www.googleapis.com/youtube', 'www.googleapis.com/customsearch']) assert.equal(html.includes(value), false, value);
  assert.doesNotMatch(html, /x-api-key|anthropic-dangerous-direct-browser-access/);
  assert.match(html, /\/api\/tool-suite\?action=anthropic/);
  assert.match(html, /\/api\/tool-suite\?action=serpapi/);
  assert.match(html, /\/api\/tool-suite\?action=youtube/);
});

test('shared configuration returns booleans and never a secret', () => {
  const { configurationStatus } = require('../api/tool-suite');
  const status = configurationStatus({ ANTHROPIC_API_KEY: 'secret-a', SERPAPI_KEY: 'secret-s', YOUTUBE_API_KEY: 'secret-y', GOOGLE_SEARCH_API_KEY: 'secret-g', GOOGLE_SEARCH_ENGINE_ID: 'cx', GOOGLE_PLACES_API_KEY: 'secret-p', SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_ROLE_KEY: 'secret-db' });
  assert.deepEqual(Object.values(status).every((value) => typeof value === 'boolean'), true);
  assert.equal(JSON.stringify(status).includes('secret'), false);
});

test('configuration route rejects unsupported methods', async () => {
  const handler = require('../api/tool-suite'); const out = res();
  await handler({ method: 'POST', query: { action: 'configuration' } }, out);
  assert.equal(out.statusCode, 405); assert.equal(out.body.error.code, 'METHOD_NOT_ALLOWED');
});

test('Anthropic route handles missing setup, success, provider failure and hides the secret', async () => {
  const handler = require('../api/tool-suite');
  const oldKey = process.env.ANTHROPIC_API_KEY; const oldFetch = global.fetch; const oldError = console.error;
  console.error = () => {};
  try {
    delete process.env.ANTHROPIC_API_KEY;
    let out = res(); await handler({ method: 'POST', query: { action: 'anthropic' }, body: { messages: [{ role: 'user', content: 'Hello' }] } }, out);
    assert.equal(out.statusCode, 503); assert.equal(out.body.error.code, 'SETUP_REQUIRED');
    process.env.ANTHROPIC_API_KEY = 'server-only-secret';
    let sent;
    global.fetch = async (url, options) => { sent = { url, options }; return response({ content: [{ text: 'Safe answer' }] }); };
    out = res(); await handler({ method: 'POST', query: { action: 'anthropic' }, body: { messages: [{ role: 'user', content: 'Hello' }], max_tokens: 100 } }, out);
    assert.equal(out.statusCode, 200); assert.equal(out.body.content[0].text, 'Safe answer');
    assert.equal(JSON.stringify(out.body).includes('server-only-secret'), false);
    assert.equal(sent.options.headers['x-api-key'], 'server-only-secret');
    global.fetch = async () => response({ error: { message: 'raw provider detail' } }, 429);
    out = res(); await handler({ method: 'POST', query: { action: 'anthropic' }, body: { messages: [{ role: 'user', content: 'Hello' }] } }, out);
    assert.equal(out.statusCode, 429); assert.equal(out.body.error.message.includes('raw provider detail'), false);
  } finally { console.error = oldError; global.fetch = oldFetch; if (oldKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = oldKey; }
});

test('provider foundation validates JSON, size and timeouts', async () => {
  const { fetchWithTimeout, parseJsonBody } = require('../api/_shared/provider');
  assert.throws(() => parseJsonBody({ body: '{bad' }), (error) => error.code === 'INVALID_JSON');
  assert.throws(() => parseJsonBody({ body: { value: 'x'.repeat(100) } }, 20), (error) => error.code === 'REQUEST_TOO_LARGE');
  const oldFetch = global.fetch;
  global.fetch = (_, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  try { await assert.rejects(fetchWithTimeout('https://provider.example', {}, 5), (error) => error.code === 'PROVIDER_TIMEOUT'); }
  finally { global.fetch = oldFetch; }
});

test('Rank Tracker provider validates inputs and normalizes success', async () => {
  const handler = require('../api/tool-suite'); const oldKey = process.env.SERPAPI_KEY; const oldFetch = global.fetch; const oldError = console.error; console.error = () => {};
  try {
    delete process.env.SERPAPI_KEY; let out = res(); await handler({ method: 'POST', query: { action: 'serpapi' }, body: { keyword: 'local seo', domain: 'example.com' } }, out); assert.equal(out.body.error.code, 'SETUP_REQUIRED');
    process.env.SERPAPI_KEY = 'server-serp';
    global.fetch = async () => response({ organic_results: [{ position: 3, link: 'https://www.example.com/page' }] });
    out = res(); await handler({ method: 'POST', query: { action: 'serpapi' }, body: { keyword: 'local seo', domain: 'example.com' } }, out); assert.deepEqual(out.body, { found: true, position: 3 });
    out = res(); await handler({ method: 'POST', query: { action: 'serpapi' }, body: { keyword: '', domain: 'bad domain' } }, out); assert.equal(out.body.error.code, 'VALIDATION_ERROR');
  } finally { console.error = oldError; global.fetch = oldFetch; if (oldKey === undefined) delete process.env.SERPAPI_KEY; else process.env.SERPAPI_KEY = oldKey; }
});

test('YouTube provider validates resources, succeeds, and never returns its key', async () => {
  const handler = require('../api/tool-suite'); const oldKey = process.env.YOUTUBE_API_KEY; const oldFetch = global.fetch; const oldError = console.error; console.error = () => {};
  try {
    process.env.YOUTUBE_API_KEY = 'server-youtube';
    let requestedUrl = '';
    global.fetch = async (url) => { requestedUrl = String(url); return response({ items: [{ id: { videoId: 'one' } }] }); };
    let out = res(); await handler({ method: 'GET', query: { action: 'youtube', resource: 'search', part: 'snippet', q: 'seo', type: 'video' } }, out);
    assert.equal(out.statusCode, 200); assert.equal(JSON.stringify(out.body).includes('server-youtube'), false); assert.match(requestedUrl, /key=server-youtube/);
    out = res(); await handler({ method: 'GET', query: { action: 'youtube', resource: 'channels' } }, out); assert.equal(out.body.error.code, 'VALIDATION_ERROR');
  } finally { console.error = oldError; global.fetch = oldFetch; if (oldKey === undefined) delete process.env.YOUTUBE_API_KEY; else process.env.YOUTUBE_API_KEY = oldKey; }
});

test('remote and generated content crosses the shared safe-rendering boundary', () => {
  assert.match(html, /ToolSuite\.escapeText\(sig\.title\)/);
  assert.match(html, /ToolSuite\.escapeText\(lead\.title\)/);
  assert.match(html, /ToolSuite\.escapeText\(content\)/);
  assert.match(html, /ToolSuite\.safeUrl\(lead\.url\)/);
  global.window = { location: { origin: 'https://www.firstcustomer.in' }, dispatchEvent() {} };
  global.CustomEvent = class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  delete require.cache[require.resolve('../assets/js/tool-suite-runtime.js')]; require('../assets/js/tool-suite-runtime.js');
  assert.equal(window.ToolSuite.escapeText('<img onerror=alert(1)>'), '&lt;img onerror=alert(1)&gt;');
  assert.equal(window.ToolSuite.safeUrl('javascript:alert(1)'), '');
  delete global.window; delete global.CustomEvent;
});

test('configuration, loading recovery, empty states and navigation contracts exist for every tool', () => {
  assert.match(html, /finally\{\s*btn\.textContent="🔄 Auto-check positions";btn\.disabled=false/);
  assert.match(html, /No saved leads yet/); assert.match(html, /No signals found/); assert.match(html, /No videos found/); assert.match(html, /Discover local businesses/);
  assert.match(html, /const deadline = Date\.now\(\)\+22000/);
  assert.match(html, /Reddit is temporarily unavailable/);
  assert.match(html, /finally\{[\s\S]*?btn\.disabled=false;[\s\S]*?\}\s*\}\s*\n\s*async function lfAIQueries/);
  assert.match(html, /Setup required: configure ANTHROPIC_API_KEY/); assert.match(html, /configure YOUTUBE_API_KEY/); assert.match(html, /require SERPAPI_KEY/);
});
