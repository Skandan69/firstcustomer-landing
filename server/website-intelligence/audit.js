const { fetchPage } = require('./fetcher');
const { analyseHtml } = require('./parser');
const { scoreAudit } = require('./scoring');

async function auditWebsite(website, { request = fetchPage, now = () => new Date() } = {}) {
  const page = await request(website);
  const origin = new URL(page.url).origin;
  const [robots, sitemap] = await Promise.all([
    inspectSupportingFile(`${origin}/robots.txt`, request),
    inspectSupportingFile(`${origin}/sitemap.xml`, request)
  ]);
  const parsed = analyseHtml(page.body);
  const audit = {
    version: 1,
    requestedUrl: new URL(website).href,
    finalUrl: page.url,
    auditedAt: now().toISOString(),
    health: {
      reachable: true,
      https: new URL(page.url).protocol === 'https:',
      sslPresence: new URL(page.url).protocol === 'https:',
      httpStatus: page.status,
      redirects: page.redirects || [],
      robotsTxt: robots,
      sitemapXml: sitemap
    },
    ...parsed
  };
  return { ...audit, ...scoreAudit(audit) };
}

async function inspectSupportingFile(url, request) {
  try {
    const result = await request(url);
    return { found: result.status >= 200 && result.status < 400, status: result.status };
  } catch (error) {
    return { found: false, status: null };
  }
}

module.exports = { auditWebsite, inspectSupportingFile };
