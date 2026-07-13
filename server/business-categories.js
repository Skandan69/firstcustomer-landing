const categories = require('../shared/business-categories.json');

const aliasIndex = new Map();
for (const category of categories) for (const alias of [category.id, category.label, ...(category.aliases || [])]) aliasIndex.set(normalize(alias), category);

function resolveCategory(value) {
  const input = clean(value);
  const category = aliasIndex.get(normalize(input));
  return category ? { recognized: true, input, ...category } : { recognized: false, input, id: normalize(input).replace(/\s+/g, '_'), label: input, aliases: [], googleTerm: input, osmTags: [], keywords: significantTerms(input), excludedTags: [] };
}
function significantTerms(value) { return normalize(value).split(' ').filter((term) => term.length >= 3 && !['and','the','for','near','service','services','business','company'].includes(term)).slice(0, 6); }
function normalize(value) { return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function clean(value) { return typeof value === 'string' ? value.trim() : ''; }

module.exports = { categories, normalizeCategoryText: normalize, resolveCategory, significantTerms };
