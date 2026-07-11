import { searchLocalBusinesses } from './business-service.js';
import { DEFAULT_FILTERS, filterBusinesses } from './business-filters.js';
import { renderBusinessCard, renderState } from './business-renderer.js';

const state = { businesses: [], filters: { ...DEFAULT_FILTERS } };
const $ = (selector) => document.querySelector(selector);

function init() {
  const form = $('#lbfSearchForm'); if (!form) return;
  form.addEventListener('submit', handleSearch);
  $('#lbfFilters').addEventListener('click', handleFilterClick);
  $('#lbfCategoryFilter').addEventListener('change', (event) => { state.filters.category = event.target.value; renderResults(); });
  $('#lbfSort').addEventListener('change', (event) => { state.filters.sort = event.target.value; renderResults(); });
  renderResults('empty'); updateStats([]);
}

async function handleSearch(event) {
  event.preventDefault(); const location = $('#lbfLocation').value.trim();
  if (!location) { $('#lbfLocation').focus(); return; }
  const button = $('#lbfSearchButton'); button.disabled = true; button.textContent = 'Searching…';
  $('#lbfResults').innerHTML = renderState('loading', 'Finding local businesses', `Searching around ${location}.`);
  try {
    const result = await searchLocalBusinesses({ location, category: $('#lbfCategory').value.trim(), radiusKm: Number($('#lbfRadius').value) });
    state.businesses = result.businesses; state.filters = { ...DEFAULT_FILTERS }; resetControls(); populateCategories(); updateStats(state.businesses); renderResults(state.businesses.length ? 'results' : 'no-results');
  } catch (error) {
    console.error('[Local Business Finder]', error.code, error.detail || error.message);
    const configured = error.code !== 'CONFIGURATION_ERROR';
    $('#lbfResults').innerHTML = renderState('error', configured ? 'Search temporarily unavailable' : 'Business search needs configuration', configured ? 'Please try again shortly. If the problem continues, contact support.' : 'The secure business search service has not been configured yet.');
  } finally { button.disabled = false; button.textContent = 'Find Local Businesses'; }
}

function handleFilterClick(event) {
  const button = event.target.closest('[data-filter]'); if (!button) return;
  const [key, value] = button.dataset.filter.split(':');
  if (key === 'website') state.filters.website = value;
  else if (key === 'rating') state.filters.rating = state.filters.rating === Number(value) ? 0 : Number(value);
  else if (key === 'reviews') state.filters.reviews = state.filters.reviews === Number(value) ? 0 : Number(value);
  else if (key === 'phone') state.filters.phone = !state.filters.phone;
  document.querySelectorAll(`[data-filter^="${key}:"]`).forEach((item) => item.classList.toggle('active', key === 'website' ? item === button : item === button && Boolean(state.filters[key]))); renderResults();
}

function renderResults(mode = 'results') {
  const container = $('#lbfResults'); if (!container) return;
  if (mode === 'empty') { container.innerHTML = renderState('empty', 'Discover businesses near you', 'Enter a location to find local and privately owned businesses. Adding a category is optional.'); return; }
  const businesses = filterBusinesses(state.businesses, state.filters);
  container.innerHTML = businesses.length ? businesses.map(renderBusinessCard).join('') : renderState('no-results', 'No matching businesses', state.businesses.length ? 'Try removing one or more filters.' : 'Try a broader location or leave the category blank.');
}
function updateStats(items) { const rated = items.filter((b) => Number(b.rating)); const values = [items.length, items.filter((b) => !b.website).length, items.filter((b) => b.website && b.websiteStatus !== 'available').length, items.filter((b) => b.phone).length, rated.length ? (rated.reduce((sum, b) => sum + Number(b.rating), 0) / rated.length).toFixed(1) : '—']; document.querySelectorAll('[data-stat]').forEach((el, i) => { el.textContent = values[i]; }); }
function populateCategories() { const select = $('#lbfCategoryFilter'); const categories = [...new Set(state.businesses.map((b) => b.category).filter(Boolean))].sort(); select.innerHTML = '<option value="">All categories</option>' + categories.map((c) => `<option value="${c.replace(/"/g, '&quot;')}">${c.replace(/</g, '&lt;')}</option>`).join(''); }
function resetControls() { document.querySelectorAll('[data-filter]').forEach((button) => button.classList.toggle('active', button.dataset.filter === 'website:all')); $('#lbfCategoryFilter').value = ''; $('#lbfSort').value = 'opportunity'; }
document.addEventListener('DOMContentLoaded', init);
