# Secure Provider Migration Inventory

## Scope and decision

This inventory covers the framework-free application in `tools/index.html` and the server routes under `api/`. The first migration is **Lead Finder → Anthropic**, because it combines a paid browser-stored key, a direct authenticated provider call, remote Reddit content, and AI-generated output in an active tool.

Lead Finder now calls `POST /api/legacy/anthropic/messages`. `ANTHROPIC_API_KEY` is read only by the Vercel function. Existing `fc_ant` data is deliberately retained for backward compatibility with unmigrated tools, but Lead Finder neither reads nor sends it.

## Provider and feature inventory

| Tool / feature | Current browser-side flow | Credential storage | Third-party endpoint | Risk | Proposed server route | Complexity | Backward compatibility |
|---|---|---|---|---|---|---|---|
| Lead Finder query generation and outreach | **Migrated:** browser sends a bounded purpose and prompt to FirstCustomer; server calls Anthropic | Legacy `localStorage.fc_ant` retained but unused by Lead Finder; server uses `ANTHROPIC_API_KEY` | `api.anthropic.com/v1/messages` | Critical before migration; Low/Medium after | `/api/legacy/anthropic/messages` (implemented) | Medium | Yes; search still uses default queries if secure AI is unavailable |
| Signal Hunter analysis and AI drafts | Direct Anthropic calls; remote/community content is included in prompts and rendered | `localStorage.fc_ant` | `api.anthropic.com/v1/messages` | Critical | `/api/legacy/anthropic/messages` with narrowly defined Signal Hunter purposes | Medium | Yes; retain existing settings notice until migrated |
| Content Studio article, social, email and ad generation | Direct Anthropic calls and generated-content rendering | `localStorage.fc_ant` | `api.anthropic.com/v1/messages` | Critical | `/api/legacy/anthropic/messages` with per-action limits | Medium | Yes |
| YouTube Studio AI optimisation | Direct Anthropic generation | `localStorage.fc_ant` | `api.anthropic.com/v1/messages` | High | `/api/legacy/anthropic/messages` with YouTube purpose | Low/Medium | Yes |
| YouTube Studio data lookup | Direct Google Data API requests with key in query string | `localStorage.fc_goog` | `youtube.googleapis.com/youtube/v3/*` | High | `/api/legacy/youtube/search` and `/api/legacy/youtube/videos` | Medium | Yes; explain server configuration before ignoring the saved key |
| Signal Hunter Google discovery | Direct Custom Search request with key and search-engine ID | `localStorage.fc_goog`, `localStorage.fc_gcx` | `customsearch.googleapis.com/customsearch/v1` | High | `/api/legacy/google-search` | Medium | Yes |
| Legacy Local Gigs discovery | Direct Custom Search request; hidden legacy implementation can still be invoked by old code paths | `localStorage.fc_goog`, `localStorage.fc_gwcx` | `customsearch.googleapis.com/customsearch/v1` | High | `/api/legacy/google-search` or retire after usage verification | Medium | Required until the legacy path is formally removed |
| Rank Tracker | Direct paid search request with key in URL | `localStorage.fc_serp` | `serpapi.com/search.json` | Critical | `/api/legacy/rank-tracker/search` | Medium | Yes; next recommended migration |
| Community discovery | Direct or proxied Reddit, PullPush, Hacker News, Dev.to, Stack Overflow and Lobsters requests | None | Public APIs plus `allorigins.win` and `corsproxy.io` | Medium | `/api/legacy/community/search` to centralise timeout, caching and validation | High | Yes |
| Local Business Finder | Already server-side with normalised Google/OpenStreetMap providers | `GOOGLE_PLACES_API_KEY` exists only server-side | Google Places, Nominatim, Overpass | Low | Existing `/api/local-businesses/search` | Existing | Yes |

## Browser storage inventory

Credential or sensitive configuration keys: `fc_ant`, `fc_goog`, `fc_gcx`, `fc_gwcx`, and `fc_serp`. Product and user data keys (`fc_products`, `fc_profile`, `fc_activity`, `fc_wins`, `fc_leads`, `fc_posts`, `fc_fb2`, `fc_onboarded`) are not provider secrets but may contain personal or commercially sensitive data and should eventually receive retention/export controls.

No migration may silently delete existing credential keys. Each tool must stop transmitting its saved credential first, show a migration notice, and only remove obsolete settings in a separately reviewed cleanup.

## Rendering and duplicated implementation inventory

`tools/index.html` contains many `innerHTML` templates. Critical/High paths are those interpolating provider responses, AI output, remote titles/snippets, saved lead data, product input, URLs, and error messages. Lead Finder result and outreach rendering is now safe-by-construction; its remaining saved-list template escapes text and validates URLs. Static layout templates remain deferred.

The file also duplicates authenticated `fetch` setup, timeout behavior, response parsing, provider-error handling, copy-button rendering, result-card rendering, and credential checks across Signal Hunter, Content Studio, YouTube Studio, Rank Tracker, and dormant Local Gigs code. New work should use:

- `assets/js/security/safe-ui.js` for text, attributes, links, phone/WhatsApp values, JSON requests, timeouts, and user-safe errors.
- `api/_shared/provider-runtime.js` for methods, JSON/body limits, provider timeouts, structured errors, safe logs, rate-limit hooks, and provider-error normalization.

## Deferred work

The shared boundary is intentionally introduced without rewriting low-risk static markup or removing legacy features. Direct Anthropic calls outside Lead Finder and the Google/SerpAPI browser flows remain security debt and must block enabling those paid integrations for untrusted production users. The recommended next migration is Rank Tracker/SerpAPI, followed by the remaining Anthropic actions, then Google YouTube and Custom Search.
