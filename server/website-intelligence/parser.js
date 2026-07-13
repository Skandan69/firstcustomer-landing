function analyseHtml(html = '') {
  const source = String(html).slice(0, 1_000_000);
  const text = visibleText(source);
  const links = collectTags(source, 'a').map((tag) => ({
    href: attribute(tag.open, 'href'),
    text: visibleText(tag.inner).trim()
  }));
  const headings = [...source.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi)].map((match) => ({
    level: Number(match[1]), text: visibleText(match[2]).trim()
  }));
  const images = [...source.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);
  const controls = [...source.matchAll(/<(input|select|textarea)\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => !/\btype\s*=\s*["']?(hidden|submit|button|reset)/i.test(tag));
  const labelFors = new Set([...source.matchAll(/<label\b[^>]*\bfor\s*=\s*["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]));
  const unlabeledControls = controls.filter((tag) => {
    const id = attribute(tag, 'id');
    return !attribute(tag, 'aria-label') && !attribute(tag, 'aria-labelledby') && !(id && labelFors.has(id));
  }).length;
  const meta = (name, property = false) => metaContent(source, name, property);
  const title = decodeEntities((source.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i) || [])[1] || '').trim();
  const canonical = findLink(source, 'canonical');
  const jsonLd = [...source.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)];
  const ctaPattern = /\b(contact|call|book|schedule|get started|get quote|request|buy|order|sign up|whatsapp|enquire|consult)\b/i;
  const buttonText = [...source.matchAll(/<(button|a)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)].map((match) => visibleText(match[2]).trim()).filter(Boolean);
  const hrefs = links.map((link) => link.href).filter(Boolean);
  const socialDomains = ['facebook.com', 'instagram.com', 'linkedin.com', 'youtube.com', 'x.com', 'twitter.com'];
  return {
    seo: {
      title,
      titleLength: title.length,
      metaDescription: meta('description'),
      canonical,
      h1Count: headings.filter((heading) => heading.level === 1).length,
      h2Count: headings.filter((heading) => heading.level === 2).length,
      openGraph: Boolean(meta('og:title', true) || meta('og:description', true) || meta('og:image', true)),
      twitterCards: Boolean(meta('twitter:card') || meta('twitter:title')),
      structuredData: jsonLd.length > 0,
      structuredDataBlocks: jsonLd.length
    },
    conversion: {
      phone: hrefs.some((href) => /^tel:/i.test(href)) || /(?:\+?\d[\d\s().-]{7,}\d)/.test(text),
      whatsapp: hrefs.some((href) => /(?:wa\.me|whatsapp\.com)/i.test(href)),
      contactForm: /<form\b/i.test(source),
      email: hrefs.some((href) => /^mailto:/i.test(href)) || /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(text),
      booking: hrefs.some((href) => /book|schedule|appointment|calendly/i.test(href)) || /\b(book|schedule) (?:a |an )?(?:call|appointment|consultation)/i.test(text),
      ctaButtons: buttonText.filter((value) => ctaPattern.test(value)).length,
      testimonials: /\b(testimonials?|reviews?|what (?:our )?customers say)\b/i.test(text) || /["']@type["']\s*:\s*["']Review["']/i.test(source),
      faq: /\bfrequently asked questions\b|\bFAQs?\b/i.test(text) || /["']@type["']\s*:\s*["']FAQPage["']/i.test(source),
      googleMaps: hrefs.some((href) => /(?:google\.[^/]+\/maps|maps\.google)/i.test(href)) || /<iframe\b[^>]+google\.[^>]+maps/i.test(source)
    },
    trust: {
      privacyPolicy: links.some((link) => /privacy/i.test(`${link.text} ${link.href}`)),
      terms: links.some((link) => /terms|conditions/i.test(`${link.text} ${link.href}`)),
      copyright: /(?:©|&copy;|copyright)\s*(?:19|20)?\d{0,4}/i.test(source),
      socialLinks: [...new Set(hrefs.filter((href) => socialDomains.some((domain) => href.toLowerCase().includes(domain))).map((href) => socialDomains.find((domain) => href.toLowerCase().includes(domain))))]
    },
    accessibility: {
      imageCount: images.length,
      imagesMissingAlt: images.filter((tag) => !/\balt\s*=\s*["'][^"']*["']/i.test(tag)).length,
      headingCount: headings.length,
      headingHierarchyIssues: countHeadingIssues(headings),
      formControlCount: controls.length,
      unlabeledFormControls: unlabeledControls
    }
  };
}

function collectTags(source, tagName) {
  const expression = new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}\\s*>`, 'gi');
  return [...source.matchAll(expression)].map((match) => ({ open: match[1], inner: match[2] }));
}
function attribute(tag, name) {
  const match = String(tag).match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:["']([^"']*)["']|([^\\s>]+))`, 'i'));
  return decodeEntities(match ? (match[1] ?? match[2] ?? '') : '');
}
function metaContent(source, name, property) {
  for (const match of source.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    if (attribute(tag, property ? 'property' : 'name').toLowerCase() === name.toLowerCase()) return attribute(tag, 'content');
  }
  return '';
}
function findLink(source, relation) {
  for (const match of source.matchAll(/<link\b[^>]*>/gi)) {
    if (attribute(match[0], 'rel').toLowerCase().split(/\s+/).includes(relation)) return attribute(match[0], 'href');
  }
  return '';
}
function countHeadingIssues(headings) {
  let issues = 0;
  for (let index = 1; index < headings.length; index += 1) if (headings[index].level > headings[index - 1].level + 1) issues += 1;
  return issues;
}
function visibleText(value) { return decodeEntities(String(value).replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ').replace(/<style\b[\s\S]*?<\/style\s*>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')); }
function decodeEntities(value) { return String(value).replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&nbsp;/gi, ' '); }

module.exports = { analyseHtml, attribute };
