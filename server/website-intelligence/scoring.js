const RULES = [
  ['health','https',5,'HTTPS is not in use','HTTPS protects visitors and is a trust signal.','Redirect every page to HTTPS and renew the TLS certificate automatically.'],
  ['health','reachable',8,'The website could not be reached','Customers and search engines cannot use an unavailable website.','Restore the website and confirm the public URL returns a successful response.'],
  ['health','healthyStatus',4,'The website returned a non-success status','Error responses reduce traffic and can remove pages from search results.','Resolve the HTTP error and return a 2xx status for the main page.'],
  ['health','robots',2,'robots.txt was not found','robots.txt communicates crawl rules to search engines.','Publish a valid /robots.txt file and reference the sitemap.'],
  ['health','sitemap',3,'sitemap.xml was not found','A sitemap helps search engines discover important pages.','Generate /sitemap.xml and submit it in Google Search Console.'],
  ['seo','title',5,'No page title was found','The title is a primary search-result and relevance signal.','Add a unique, descriptive title of roughly 30–60 characters.'],
  ['seo','metaDescription',4,'No meta description was found','A useful description can improve search-result click-through.','Add a concise page description that explains the offer and next step.'],
  ['seo','canonical',3,'No canonical URL was found','Canonical tags reduce duplicate-page ambiguity.','Add a self-referencing canonical link to the preferred page URL.'],
  ['seo','singleH1',4,'The page does not have exactly one H1','A clear H1 helps visitors and search engines understand the page.','Use one descriptive H1 and reserve H2 elements for major sections.'],
  ['seo','h2',2,'No H2 sections were found','Section headings make content easier to scan and understand.','Break the page into useful sections with descriptive H2 headings.'],
  ['seo','openGraph',2,'Open Graph metadata is missing','Social shares may appear without a useful title, description, or image.','Add og:title, og:description, og:image, and og:url metadata.'],
  ['seo','twitterCards',1,'Twitter Card metadata is missing','Shared links can lose context and visual impact on X.','Add twitter:card and matching title, description, and image metadata.'],
  ['seo','structuredData',4,'Structured data was not detected','Valid schema can help search engines understand the business.','Add appropriate JSON-LD such as LocalBusiness, Organization, or Service.'],
  ['conversion','contactMethod',5,'No phone, email, WhatsApp, or contact form was detected','Visitors need an obvious way to become a lead.','Add at least one prominent contact method and test it on mobile.'],
  ['conversion','cta',5,'No clear call-to-action was detected','Visitors are less likely to convert when the next step is unclear.','Add a prominent action such as Call, Book, Request a Quote, or Contact Us.'],
  ['conversion','testimonials',3,'Testimonials were not detected','Evidence from customers reduces purchase anxiety.','Add specific, genuine testimonials with customer context.'],
  ['conversion','faq',2,'An FAQ section was not detected','FAQs answer objections before a visitor contacts or leaves.','Add concise answers to common price, process, timing, and service questions.'],
  ['trust','privacyPolicy',3,'No privacy policy link was found','Visitors expect clarity about data collection and contact forms.','Publish and link a privacy policy from the footer and forms.'],
  ['trust','terms',2,'No terms link was found','Terms clarify service expectations and reduce disputes.','Publish relevant terms or service conditions and link them clearly.'],
  ['trust','copyright',1,'No copyright notice was detected','A current copyright notice is a basic legitimacy signal.','Add a current copyright notice in the site footer.'],
  ['trust','socialLinks',2,'No social profile links were found','Verified social profiles provide additional trust and contact paths.','Link only actively maintained business profiles.'],
  ['accessibility','imageAlt',4,'Some images are missing alt text','People using screen readers may miss important information.','Add meaningful alt text to informative images and empty alt text to decorative images.'],
  ['accessibility','headingHierarchy',2,'Heading levels are skipped','A logical heading outline improves navigation for assistive technology.','Use headings in order without skipping levels.'],
  ['accessibility','formLabels',4,'Some form controls have no accessible label','Unlabelled fields are difficult or impossible to use with assistive technology.','Associate every field with a visible label or an appropriate accessible name.']
];

function scoreAudit(audit) {
  const signals = {
    health: { https: audit.health.https, reachable: audit.health.reachable, healthyStatus: audit.health.httpStatus >= 200 && audit.health.httpStatus < 400, robots: audit.health.robotsTxt.found, sitemap: audit.health.sitemapXml.found },
    seo: { title: Boolean(audit.seo.title), metaDescription: Boolean(audit.seo.metaDescription), canonical: Boolean(audit.seo.canonical), singleH1: audit.seo.h1Count === 1, h2: audit.seo.h2Count > 0, openGraph: audit.seo.openGraph, twitterCards: audit.seo.twitterCards, structuredData: audit.seo.structuredData },
    conversion: { contactMethod: audit.conversion.phone || audit.conversion.email || audit.conversion.whatsapp || audit.conversion.contactForm, cta: audit.conversion.ctaButtons > 0, testimonials: audit.conversion.testimonials, faq: audit.conversion.faq },
    trust: { privacyPolicy: audit.trust.privacyPolicy, terms: audit.trust.terms, copyright: audit.trust.copyright, socialLinks: audit.trust.socialLinks.length > 0 },
    accessibility: { imageAlt: audit.accessibility.imagesMissingAlt === 0, headingHierarchy: audit.accessibility.headingHierarchyIssues === 0, formLabels: audit.accessibility.unlabeledFormControls === 0 }
  };
  const recommendations = [];
  let missingWeight = 0;
  const totalWeight = RULES.reduce((sum, rule) => sum + rule[2], 0);
  for (const [section, key, weight, found, why, improvement] of RULES) {
    if (!signals[section][key]) {
      missingWeight += weight;
      recommendations.push({ section, priority: weight >= 5 ? 'high' : weight >= 3 ? 'medium' : 'low', weight, found, why, improvement });
    }
  }
  const opportunityScore = Math.round((missingWeight / totalWeight) * 100);
  return { opportunityScore, healthScore: 100 - opportunityScore, recommendations };
}

module.exports = { RULES, scoreAudit };
