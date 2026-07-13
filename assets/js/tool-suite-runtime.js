(function toolSuiteRuntime(global) {
  const DEFAULT_CONFIGURATION = Object.freeze({ anthropicConfigured: false, serpApiConfigured: false, youtubeConfigured: false, googleSearchConfigured: false, googlePlacesConfigured: false, supabaseConfigured: false });
  let configuration = { ...DEFAULT_CONFIGURATION };

  async function fetchJson(url, options = {}, timeoutMs = 15_000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(payload.error?.message || friendlyMessage(payload.error?.code)), { code: payload.error?.code || 'UNEXPECTED_FAILURE', status: response.status });
      return payload;
    } catch (error) {
      if (error.name === 'AbortError') throw Object.assign(new Error('The request timed out. Please retry.'), { code: 'PROVIDER_TIMEOUT' });
      throw error;
    } finally { clearTimeout(timer); }
  }

  async function loadConfiguration() {
    try { configuration = { ...DEFAULT_CONFIGURATION, ...(await fetchJson('/api/tool-suite?action=configuration', {}, 8_000)) }; }
    catch { configuration = { ...DEFAULT_CONFIGURATION, configurationUnavailable: true }; }
    global.dispatchEvent(new CustomEvent('tool-suite-configuration', { detail: configuration }));
    return { ...configuration };
  }

  function getConfiguration() { return { ...configuration }; }
  function escapeText(value) { return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]); }
  function safeUrl(value) { try { const url = new URL(String(value), global.location.origin); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } }
  function externalLink(anchor, value) { const url = safeUrl(value); if (!url) { anchor.removeAttribute('href'); return false; } anchor.href = url; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; return true; }
  function friendlyMessage(code) { return ({ SETUP_REQUIRED: 'Setup is required before this action can run.', QUOTA_EXCEEDED: 'The provider quota has been reached. Try again later.', PROVIDER_TIMEOUT: 'The provider took too long to respond. Please retry.', PROVIDER_UNAVAILABLE: 'The provider is temporarily unavailable.', VALIDATION_ERROR: 'Check the information entered and try again.' })[code] || 'Something went wrong. Please retry.'; }
  async function anthropic(messages, maxTokens = 600) { return fetchJson('/api/tool-suite?action=anthropic', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages, max_tokens: maxTokens }) }, 25_000); }

  global.ToolSuite = Object.freeze({ anthropic, escapeText, externalLink, fetchJson, friendlyMessage, getConfiguration, loadConfiguration, safeUrl });
})(window);
