# FirstCustomer Tool Suite Status

Audit scope: the seven visible tabs in `tools/index.html` on the stabilization branch created from `main`. PR #6 Website Intelligence work is intentionally excluded.

## Status summary

| Tool | Classification | Meaningful task available | Configuration |
|---|---|---|---|
| Signal Hunter | PARTIALLY WORKING | Search real public posts from available sources; save feedback | Optional `ANTHROPIC_API_KEY`, `YOUTUBE_API_KEY`, Google Search variables |
| Rank Tracker | WORKING WITH CONFIGURATION | Import Search Console CSV, paste or manually track rankings | `SERPAPI_KEY` only for automatic checks |
| YouTube Studio | WORKING WITH CONFIGURATION | Local Video SEO Scorer; live video/channel/trending data when configured | `YOUTUBE_API_KEY` |
| Content Studio | WORKING WITH CONFIGURATION | Generate article, social, email and ad copy | `ANTHROPIC_API_KEY` |
| Lead Finder | PARTIALLY WORKING | Discover real Reddit posts, save leads; AI query/outreach assistance when configured | Optional `ANTHROPIC_API_KEY` |
| SEO Guide | WORKING | Read and navigate static educational SEO material | None |
| Local Business Finder | PARTIALLY WORKING | Search Google Places or Open Data through the existing server route | Optional `GOOGLE_PLACES_API_KEY`; Supabase variables for persistence |

`Ready`, `Setup required`, `Beta`, and `Guide` badges are resolved through the shared `/api/tool-suite?action=configuration` response. The route returns booleans only.

## 1. Signal Hunter — PARTIALLY WORKING

- **Intended purpose:** Find public posts expressing a problem a saved product solves, then draft an optional response.
- **Actual implementation:** Product definitions and feedback are stored locally. Hacker News, Reddit/PullPush, Dev.to, Stack Overflow and Lobste.rs adapters use public endpoints; YouTube and Google Search are optional server-backed sources. Results are URL-deduplicated and ranked locally.
- **Current providers:** HN Algolia, PullPush/Reddit, Dev.to, Stack Exchange, Lobste.rs proxies, optional YouTube Data API and Google Custom Search.
- **Required configuration:** None for public adapters; `YOUTUBE_API_KEY` and `GOOGLE_SEARCH_API_KEY` plus `GOOGLE_SEARCH_ENGINE_ID` for optional sources; `ANTHROPIC_API_KEY` for analysis/drafting.
- **Working functions:** Manual product setup, public-source scanning, deduplication, source/time metadata, relevance feedback, explicit source availability, secure AI drafting when configured.
- **Broken/limited functions:** Public CORS proxies and PullPush are third-party availability dependencies. A zero-result response is not proof that no matching post exists.
- **Security risks:** High browser-side Anthropic/Google credential transmission was removed. Medium risk remains from remote HTML assembled in a legacy monolith; critical result paths now escape text and validate URLs.
- **UX problems:** A full scan may be slow because adapters run sequentially. Source pills now distinguish unavailable sources instead of presenting them as successful zero-result searches.
- **Test coverage:** Initialization/static contract, no browser secrets, secure provider route, safe rendering, navigation, empty/error states.
- **Production readiness:** Beta. Useful for discovery, not a guaranteed exhaustive feed.
- **Recommended action:** Move public source adapters server-side and add durable per-source health/rate-limit telemetry.

## 2. Rank Tracker — WORKING WITH CONFIGURATION

- **Intended purpose:** Track keyword positions manually, from Search Console exports, or via automated Google results.
- **Actual implementation:** CSV/paste/manual workflows are local. Automatic checks now POST domain and keyword to `/api/tool-suite?action=serpapi`.
- **Current provider:** SerpAPI for automatic checks.
- **Required configuration:** `SERPAPI_KEY` in Vercel. Manual workflows need no provider.
- **Working functions:** CSV import, pasted rows, manual positions, filtering, tips, secure automatic checking, validation, loading recovery.
- **Broken/limited functions:** Website keyword extraction still depends on a public CORS proxy and can fall back to manual description.
- **Security risks:** Critical browser storage/transmission of the SerpAPI credential was removed. Existing legacy stored values are preserved but never read.
- **UX problems:** Automatic checking is disabled and labelled Setup required when not configured.
- **Test coverage:** Domain/keyword validation, missing configuration, success, provider failure, timeout utility, secret isolation and static loading recovery.
- **Production readiness:** Manual workflow ready; automatic workflow ready when configured.
- **Recommended action:** Replace the website CORS proxy with a bounded SSRF-safe metadata route.

## 3. YouTube Studio — WORKING WITH CONFIGURATION

- **Intended purpose:** Research videos/channels, view trends and score video SEO.
- **Actual implementation:** Live data is proxied through `/api/tool-suite?action=youtube`; the SEO scorer is deterministic browser logic.
- **Current provider:** YouTube Data API v3.
- **Required configuration:** `YOUTUBE_API_KEY` for live data. None for the SEO scorer.
- **Working functions:** Keyword video search, channel search, category/region trends, local SEO scoring and safe result rendering.
- **Broken/limited functions:** YouTube quota and regional chart coverage can reduce results; the UI reports quota/configuration failures without exposing provider payloads.
- **Security risks:** Critical browser key exposure was removed. Remote titles, descriptions, thumbnails and identifiers are escaped or validated.
- **UX problems:** Provider buttons are disabled when setup is missing; the local scorer remains usable.
- **Test coverage:** Route method/resource validation, missing key, success, secret isolation, static error/empty state, safe rendering.
- **Production readiness:** Ready when configured; scorer ready without configuration.
- **Recommended action:** Add server caching for repeated research queries.

## 4. Content Studio — WORKING WITH CONFIGURATION

- **Intended purpose:** Generate articles, social posts, email campaigns and ad copy.
- **Actual implementation:** All generation calls `/api/tool-suite?action=anthropic`; outputs remain local and copyable.
- **Current provider:** Anthropic Messages API.
- **Required configuration:** `ANTHROPIC_API_KEY`; optional `ANTHROPIC_MODEL`.
- **Working functions:** Required-input validation, bounded prompts/output, article/social/email/ad generation, copy controls, safe output rendering and loading recovery.
- **Broken/limited functions:** Generated content is not persisted because the current schema has no content table.
- **Security risks:** Critical direct browser Anthropic calls and credential transmission were removed. Generated output is escaped before HTML rendering.
- **UX problems:** All generation buttons are disabled with one Setup required explanation when unavailable.
- **Test coverage:** Provider method/body validation, missing configuration, success/failure/timeout, no secret return/transmission, output escaping.
- **Production readiness:** Ready when configured; otherwise honestly unavailable.
- **Recommended action:** Add optional persistence only with a purpose-built schema and ownership model.

## 5. Lead Finder — PARTIALLY WORKING

- **Intended purpose:** Find real demand posts and help prepare outreach.
- **Actual implementation:** Searches real Reddit posts through public proxies, saves selected posts locally and optionally uses the secure Anthropic route for query/outreach assistance.
- **Current providers:** Reddit/public proxy; optional Anthropic.
- **Required configuration:** None for default discovery; `ANTHROPIC_API_KEY` for AI assistance.
- **Working functions:** Input validation, two-wave real-post search, URL deduplication, real-source labelling, save/remove/status/export and secure outreach generation.
- **Broken/limited functions:** Reddit/proxy availability is external and search is not exhaustive.
- **Security risks:** Critical direct Anthropic calls were removed. Remote lead text and generated outreach are escaped. Results are labelled potential leads, not verified companies.
- **UX problems:** Beta status and AI configuration requirements are explicit; failures restore buttons.
- **Test coverage:** Initialization, validation contract, provider configuration, secure AI route, safe rendering, saved-lead local behavior and empty states.
- **Production readiness:** Beta.
- **Recommended action:** Move Reddit discovery server-side and persist only user-selected leads through the canonical saved-lead model.

## 6. SEO Guide — WORKING

- **Intended purpose:** Teach SEO fundamentals.
- **Actual implementation/provider:** Static educational content; no provider, API route or live audit exists.
- **Required configuration:** None.
- **Working functions:** Navigation, section anchors, FAQ interactions and responsive reading layout.
- **Broken functions:** None claimed.
- **Security risks:** Low; static markup only.
- **UX problems:** Previously grouped with interactive tools. It is now explicitly labelled Guide and does not claim to analyse a website.
- **Test coverage:** Tab initialization, static classification and navigation regression.
- **Production readiness:** Ready as educational content.
- **Recommended action:** Keep separate from PR #6 Website Intelligence to avoid duplicate product claims.

## 7. Local Business Finder — PARTIALLY WORKING

- **Intended purpose:** Discover local businesses and manage saved leads/searches.
- **Actual implementation:** Browser calls `/api/local-businesses/search`; Google Places and Open Data normalize server-side. Supabase persistence is server-only.
- **Current providers:** Google Places API (New), Nominatim and public Overpass.
- **Required configuration:** `GOOGLE_PLACES_API_KEY` for Google; `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for persistence. Open Data uses no paid key.
- **Working functions:** Provider selection, validation, normalized cards, filtering, pagination only for Google, persistence and user-safe errors.
- **Broken/limited functions:** Google permission/billing restrictions and public Overpass availability are external. This branch intentionally retains `main` behavior and does not import PR #6.
- **Security risks:** Server secrets remain server-side. Existing normalized result rendering escapes provider values.
- **UX problems:** Labelled Beta because provider availability is not guaranteed.
- **Test coverage:** Provider selection, normalization, validation, timeout/error behavior, XSS protection, persistence and navigation.
- **Production readiness:** Beta until provider availability is operationally monitored.
- **Recommended action:** Merge this stabilization branch before rebasing PR #6; then rebase PR #6 and resolve only status/runtime integration conflicts.

## Deferred Medium and Low findings

- `tools/index.html` is an architectural hotspot containing all six legacy workflows and duplicated rendering/loading patterns.
- Public CORS proxies remain availability and privacy dependencies for website extraction, Reddit and Lobste.rs.
- Several low-risk static/local templates still use `innerHTML`; migrate the remaining legacy shell incrementally to DOM construction.
- Local product, lead, ranking, profile and activity data have no authenticated ownership boundary.
- Per-instance serverless throttling and caching are not durable.
- Provider health is request-local; durable monitoring and historical uptime require external telemetry.
