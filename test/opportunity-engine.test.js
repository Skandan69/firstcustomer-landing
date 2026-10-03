const test = require('node:test');
const assert = require('node:assert/strict');

test('strong no-website businesses rank as high opportunities', async () => {
  const { evaluateOpportunity } = await import('../assets/js/local-business/opportunity-engine.mjs');
  const opportunity = evaluateOpportunity({
    provider: 'google',
    website: '',
    phone: '+914012345678',
    rating: 4.7,
    reviewCount: 180,
    businessStatus: 'OPERATIONAL'
  });
  assert.ok(opportunity.score >= 70);
  assert.equal(opportunity.level, 'high');
  assert.equal(opportunity.recommendedService, 'New business website');
  assert.ok(opportunity.reasons.some((reason) => /No website/i.test(reason)));
});

test('weak Open Data records do not become high priority just because they lack a website', async () => {
  const { evaluateOpportunity } = await import('../assets/js/local-business/opportunity-engine.mjs');
  const opportunity = evaluateOpportunity({ provider: 'openstreetmap', website: '', phone: '', rating: null, reviewCount: null });
  assert.ok(opportunity.score < 70);
  assert.equal(opportunity.confidence, 'Limited');
});

test('website audits refine the opportunity and recommended offer', async () => {
  const { evaluateOpportunity } = await import('../assets/js/local-business/opportunity-engine.mjs');
  const opportunity = evaluateOpportunity(
    { provider: 'google', website: 'https://example.com', phone: '+9140', rating: 4.5, reviewCount: 120, businessStatus: 'OPERATIONAL' },
    {
      opportunityScore: 80,
      healthScore: 20,
      recommendations: [
        { section: 'conversion', found: 'No booking action was detected', weight: 6 },
        { section: 'conversion', found: 'WhatsApp was not detected', weight: 5 },
        { section: 'seo', found: 'Meta description is missing', weight: 4 }
      ]
    }
  );
  assert.ok(opportunity.score >= 70);
  assert.equal(opportunity.recommendedService, 'Conversion-focused website redesign');
  assert.ok(opportunity.reasons.some((reason) => /booking/i.test(reason)));
});

test('opportunity filter and sort put the best lead first', async () => {
  const { filterBusinesses, DEFAULT_FILTERS } = await import('../assets/js/local-business/business-filters.mjs');
  const businesses = [
    { name: 'Low', website: 'https://low.test', opportunity: { score: 30 }, rating: 5, reviewCount: 500 },
    { name: 'High', website: '', opportunity: { score: 88 }, rating: 4.3, reviewCount: 80 },
    { name: 'Medium', website: '', opportunity: { score: 55 }, rating: 4.8, reviewCount: 100 }
  ];
  const sorted = filterBusinesses(businesses, { ...DEFAULT_FILTERS, opportunity: 70 });
  assert.deepEqual(sorted.map((business) => business.name), ['High']);
});

test('business cards surface opportunity score and recommended offer safely', async () => {
  const { renderBusinessCard } = await import('../assets/js/local-business/business-renderer.mjs');
  const html = renderBusinessCard({
    provider: 'google',
    providerId: 'g1',
    name: '<b>Clinic</b>',
    category: 'Dentist',
    address: 'Road',
    phone: '+914012345678',
    website: '',
    rating: 4.7,
    reviewCount: 120,
    businessStatus: 'OPERATIONAL',
    sourceUrl: 'https://maps.google.com/'
  });
  assert.match(html, /Opportunity/);
  assert.match(html, /New business website/);
  assert.equal(html.includes('<b>Clinic</b>'), false);
});
