const dns = require('node:dns').promises;
const net = require('node:net');

const MAX_BODY_BYTES = 1_000_000;
const MAX_REDIRECTS = 5;

async function fetchPage(rawUrl, { fetchImpl = global.fetch, resolveHost = resolveHostname, timeoutMs = 10_000, maxBytes = MAX_BODY_BYTES } = {}) {
  let current = await validatePublicUrl(rawUrl, resolveHost);
  const redirects = [];
  for (let count = 0; count <= MAX_REDIRECTS; count += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(current.href, { method: 'GET', redirect: 'manual', signal: controller.signal, headers: { 'User-Agent': 'FirstCustomer-Website-Intelligence/1.0 (+https://www.firstcustomer.in)' } });
    } catch (cause) {
      if (cause.name === 'AbortError') throw failure('WEBSITE_TIMEOUT', 'The website took too long to respond.', 504);
      throw failure('WEBSITE_UNREACHABLE', 'The website could not be reached.', 502);
    } finally { clearTimeout(timer); }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers?.get?.('location');
      if (!location) throw failure('INVALID_REDIRECT', 'The website returned an invalid redirect.', 502);
      if (count === MAX_REDIRECTS) throw failure('TOO_MANY_REDIRECTS', 'The website redirected too many times.', 502);
      const next = await validatePublicUrl(new URL(location, current).href, resolveHost);
      redirects.push({ from: current.href, to: next.href, status: response.status });
      current = next;
      continue;
    }
    return { url: current.href, status: response.status, headers: response.headers, body: await readLimitedBody(response, maxBytes), redirects };
  }
  throw failure('TOO_MANY_REDIRECTS', 'The website redirected too many times.', 502);
}

async function validatePublicUrl(rawUrl, resolveHost = resolveHostname) {
  let url;
  try { url = new URL(String(rawUrl)); } catch { throw failure('INVALID_WEBSITE_URL', 'Enter a valid public website URL.', 400); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw failure('INVALID_WEBSITE_URL', 'Enter a valid public HTTP or HTTPS website URL.', 400);
  if (url.port && !['80', '443'].includes(url.port)) throw failure('UNSAFE_WEBSITE_URL', 'Only standard website ports can be audited.', 400);
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) throw failure('UNSAFE_WEBSITE_URL', 'Private network addresses cannot be audited.', 400);
  const addresses = net.isIP(hostname) ? [hostname] : await resolveHost(hostname);
  if (!addresses.length || addresses.some(isPrivateAddress)) throw failure('UNSAFE_WEBSITE_URL', 'Private network addresses cannot be audited.', 400);
  url.hash = '';
  return url;
}

async function resolveHostname(hostname) {
  try { return (await dns.lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address); }
  catch { throw failure('WEBSITE_DNS_FAILED', 'The website address could not be resolved.', 502); }
}
function isPrivateAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const normalized = address.toLowerCase();
  if (normalized.startsWith('::ffff:')) return isPrivateAddress(normalized.slice(7));
  return normalized === '::' || normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb') || normalized.startsWith('::ffff:127.') || normalized.startsWith('::ffff:10.') || normalized.startsWith('::ffff:192.168.');
}
async function readLimitedBody(response, maxBytes) {
  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text) > maxBytes) throw failure('WEBSITE_TOO_LARGE', 'The website response is too large to audit safely.', 413);
    return text;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0; let output = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { await reader.cancel(); throw failure('WEBSITE_TOO_LARGE', 'The website response is too large to audit safely.', 413); }
    output += decoder.decode(value, { stream: true });
  }
  return output + decoder.decode();
}
function failure(code, message, status) { return Object.assign(new Error(message), { code, status }); }

module.exports = { MAX_BODY_BYTES, fetchPage, isPrivateAddress, validatePublicUrl };
