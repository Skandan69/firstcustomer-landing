import { searchLocalBusinesses } from './business-service.js';
import { DEFAULT_FILTERS, filterBusinesses } from './business-filters.mjs';
import { renderBusinessCard, renderState } from './business-renderer.js';

const state = { businesses: [], filters: { ...DEFAULT_FILTERS }, criteria: null, nextPageToken: null };
const $ = (selector) => document.querySelector(selector);

function init() {
  if (!$('#lbfSearchForm')) return;
  $('#lbfSearchForm').addEventListener('submit', handleSearch);
  $('#lbfLoadMore').addEventListener('click', handleLoadMore);
  $('#lbfFilters').addEventListener('click', handleFilterClick);
  $('#lbfCategoryFilter').addEventListener('change', (event) => { state.filters.category = event.target.value; renderResults(); });
  $('#lbfStatusFilter').addEventListener('change', (event) => { state.filters.businessStatus = event.target.value; renderResults(); });
  $('#lbfSort').addEventListener('change', (event) => { state.filters.sort = event.target.value; renderResults(); });
  renderResults('empty'); updateStats();
}

async function handleSearch(event) {
  event.preventDefault(); const location = $('#lbfLocation').value.trim(); if (!location) { $('#lbfLocation').focus(); return; }
  state.criteria = { location, category: $('#lbfCategory').value.trim(), radiusKm: Number($('#lbfRadius').value) };
  setSearchBusy(true); $('#lbfSearchContext').textContent = state.criteria.category ? `Targeted search for “${state.criteria.category}” near ${location}.` : 'Showing businesses Google identifies for this location. Use a category to run a more targeted search.';
  $('#lbfResults').innerHTML = renderState('loading', 'Finding local businesses', `Searching around ${location}.`);
  try {
    const result = await searchLocalBusinesses(state.criteria);
    state.businesses = dedupe(result.businesses); state.nextPageToken = result.nextPageToken; state.filters = { ...DEFAULT_FILTERS };
    resetControls(); refreshDerivedUi(); renderResults(state.businesses.length ? 'results' : 'no-results');
  } catch (error) { renderFriendlyError(error); }
  finally { setSearchBusy(false); }
}

async function handleLoadMore() {
  if (!state.nextPageToken || !state.criteria) return; const button = $('#lbfLoadMore'); button.disabled = true; button.textContent = 'Loading…';
  try { const result = await searchLocalBusinesses({ ...state.criteria, pageToken: state.nextPageToken }); state.businesses = dedupe([...state.businesses, ...result.businesses]); state.nextPageToken = result.nextPageToken; refreshDerivedUi(); renderResults(); }
  catch (error) { renderFriendlyError(error, true); }
  finally { button.disabled = false; button.textContent = 'Load More Businesses'; updateLoadMore(); }
}

function handleFilterClick(event) {
  const button = event.target.closest('[data-filter]'); if (!button) return; const [key, value] = button.dataset.filter.split(':');
  if (key === 'website') state.filters.website = value;
  else if (key === 'rating') state.filters.rating = state.filters.rating === Number(value) ? 0 : Number(value);
  else if (key === 'reviews') state.filters.reviews = state.filters.reviews === Number(value) ? 0 : Number(value);
  else if (key === 'phone') state.filters.phone = !state.filters.phone;
  document.querySelectorAll(`[data-filter^="${key}:"]`).forEach((item) => item.classList.toggle('active', key === 'website' ? item === button : item === button && Boolean(state.filters[key]))); renderResults();
}

function renderResults(mode = 'results') { const container = $('#lbfResults'); if (mode === 'empty') { container.innerHTML = renderState('empty', 'Discover businesses near you', 'Enter a location to find local and privately owned businesses. Adding a category is optional.'); return; } const businesses = filterBusinesses(state.businesses, state.filters); container.innerHTML = businesses.length ? businesses.map(renderBusinessCard).join('') : renderState('no-results', 'No matching businesses', state.businesses.length ? 'Try removing one or more filters.' : 'No businesses were returned. Try a broader location or leave the category blank.'); }
function renderFriendlyError(error, pagination = false) { console.error('[Local Business Finder]', error.code, error.message); const messages = { PLACES_ENV_NOT_INJECTED: ['Vercel environment variable not injected', error.message], PLACES_BILLING_REQUIRED: ['Google Cloud billing required', error.message], PLACES_API_NOT_ENABLED: ['Places API (New) is not enabled', error.message], PLACES_KEY_REJECTED: ['Google rejected the API key', error.message], PLACES_PERMISSION_DENIED: ['Google Places permission denied', error.message], PLACES_QUOTA_EXCEEDED: ['Google Places quota reached', error.message], INVALID_LOCATION: ['Check the location', error.message], INVALID_PAGE_TOKEN: ['This page expired', error.message], SEARCH_FAILED: ['Google Places search failed', error.message], NETWORK_ERROR: ['Connection problem', 'Check your connection and try again.'], TIMEOUT: ['Search timed out', 'Google Places took too long to respond. Please try again.'] }; const [title, message] = messages[error.code] || ['Search temporarily unavailable', error.message || 'Please try again shortly.']; if (pagination && state.businesses.length) { $('#lbfPaginationMessage').textContent = message; state.nextPageToken = null; updateLoadMore(); } else { $('#lbfResults').innerHTML = renderState('error', title, message); } }
function refreshDerivedUi() { populateSelect('#lbfCategoryFilter', 'All categories', state.businesses.map((b) => b.category)); populateSelect('#lbfStatusFilter', 'All business statuses', state.businesses.map((b) => b.businessStatus), formatStatus); updateStats(); updateLoadMore(); }
function updateStats() { const rated = state.businesses.filter((b) => b.rating !== null); const values = [state.businesses.length, state.businesses.filter((b) => !b.website).length, state.businesses.filter((b) => b.website).length, state.businesses.filter((b) => b.phone || b.internationalPhone).length, rated.length ? (rated.reduce((sum, b) => sum + b.rating, 0) / rated.length).toFixed(1) : '—']; document.querySelectorAll('[data-stat]').forEach((el, index) => { el.textContent = values[index]; }); }
function updateLoadMore() { $('#lbfLoadMore').hidden = !state.nextPageToken; if (state.nextPageToken) $('#lbfPaginationMessage').textContent = 'More Google Places results are available.'; }
function populateSelect(selector, label, values, formatter = (value) => value) { const select = $(selector); const current = select.value; const unique = [...new Set(values.filter(Boolean))].sort(); select.innerHTML = `<option value="">${label}</option>` + unique.map((value) => `<option value="${escapeAttribute(value)}">${escapeText(formatter(value))}</option>`).join(''); select.value = unique.includes(current) ? current : ''; }
function resetControls() { document.querySelectorAll('[data-filter]').forEach((button) => button.classList.toggle('active', button.dataset.filter === 'website:all')); $('#lbfCategoryFilter').value = ''; $('#lbfStatusFilter').value = ''; $('#lbfSort').value = 'website-opportunity'; }
function setSearchBusy(busy) { const button = $('#lbfSearchButton'); button.disabled = busy; button.textContent = busy ? 'Searching…' : 'Find Local Businesses'; if (busy) { state.nextPageToken = null; updateLoadMore(); } }
function dedupe(items) { const seen = new Set(); return items.filter((item) => { const key = item.id || `${item.name}|${item.address}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
function formatStatus(value) { return value.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()); }
function escapeAttribute(value) { return String(value).replace(/[&"]/g, (c) => c === '&' ? '&amp;' : '&quot;'); }
function escapeText(value) { return String(value).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
document.addEventListener('DOMContentLoaded', init);
