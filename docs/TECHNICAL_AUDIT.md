# FirstCustomer Technical Audit

Scope: full repository audit of the production static application and draft PR #2. The repository contains a marketing page, a 374 KB/5,662-line legacy application shell, modular Local Business Finder assets, one Vercel API route, and Node built-in tests.

## Summary

| Severity | Count | PR #2 blockers |
|---|---:|---:|
| Critical | 0 | 0 |
| High | 9 | 7 fixed |
| Medium | 9 | 0 |
| Low | 5 | 0 |

## Critical

No confirmed Critical issue was found. No server secret is committed, returned by the discovery API, or referenced by browser code.

## High

| File | Problem | User impact | Recommended fix | Block PR #2? |
|---|---|---|---|---|
| `assets/js/local-business/local-business-finder.js` | Concurrent searches could complete out of order and overwrite a newer provider/result set. | Google and Open Data could appear to mix, or users could see results for the wrong query. | Abort the previous browser request and ignore responses from stale request generations. **Fixed.** | Yes |
| `assets/js/local-business/local-business-finder.js` | New searches retained old businesses, metrics, notices, filters, and pagination while loading. | Stale data looked current and Load More could target the wrong session. | Clear session state synchronously before each request. **Fixed.** | Yes |
| `assets/js/local-business/local-business-finder.js` | Pagination visibility depended only on a token, not provider capability. | A malformed Open Data response could expose Google-only pagination and mix sessions. | Require `provider === "google"` and pin page requests to Google. **Fixed.** | Yes |
| `assets/js/local-business/business-filters.mjs` | Null ratings/reviews passed active threshold filters. | Unrated Google businesses could appear in “4.0+”; Open Data semantics were ambiguous. | Treat null as unavailable/excluded when a threshold is active; disable and visibly explain these controls for Open Data. **Fixed.** | Yes |
| `api/local-businesses/providers/open-data.js` | Category aliases were used in the Overpass query but not in post-query matching. | Valid salon/dental/etc. results could all disappear. | Reuse normalized OSM alias values during post-filtering. **Fixed.** | Yes |
| `assets/js/local-business/local-business-finder.js` | Error titles referenced removed `PLACES_*` codes instead of provider-specific `GOOGLE_*`/`OPEN_DATA_*` codes. | Useful failures degraded to a generic error. | Map current provider errors to actionable user-facing states. **Fixed.** | Yes |
| `tools/index.html` | Hidden legacy Local Gigs initialization still ran when the modular finder opened. | Missing legacy DOM IDs could cause future regressions or duplicated state. | Make legacy Local Gigs functions dormant while retaining code for later migration. **Fixed.** | Yes |
| `tools/index.html` | Anthropic, Google/YouTube, Custom Search, and SerpAPI keys are stored in `localStorage` and used from browser JavaScript. | Any same-origin XSS or malicious extension can steal user-entered credentials. | Move legacy API calls behind server routes and stop persisting raw keys in localStorage. | No—pre-existing architecture outside PR #2; schedule as a dedicated security migration. |
| `tools/index.html` | Active legacy tools render remote/API/user content through many `innerHTML` templates without one enforced escaping boundary. | A malicious remote title/snippet or saved value may execute script and expose local data/keys. | Introduce shared escaping/safe DOM render helpers, then migrate active panels incrementally with security tests. | No—pre-existing and broad; Local Business Finder rendering is escaped and tested. |

## Medium

| File | Problem | User impact | Recommended fix | Block PR #2? |
|---|---|---|---|---|
| `api/local-businesses/search.js` | Rate limiting is per warm instance and trusts forwarded IP state available to the function. | Limits reset across instances/restarts and cannot reliably prevent distributed abuse. | Use durable rate limiting (Redis/Vercel KV) and verified platform IP metadata. | No |
| `api/local-businesses/providers/open-data.js` | Nominatim throttle and caches are per serverless instance. | Parallel instances can exceed intended aggregate request rates; cold starts lose cache. | Add durable geocode/search cache and a centralized request gate. | No; documented limitation. |
| `api/local-businesses/providers/open-data.js` | Public Overpass mirrors are externally overloaded and returned 504/timeouts during live checks. | Open Data fallback can temporarily fail despite correct application behavior. | Use durable cached results and a managed/self-hosted Overpass service for production reliability. | No for best-effort fallback; monitor before depending on it operationally. |
| `api/local-businesses/providers/open-data.js` | Optional-category searches over large radii scan broad POI tag families. | A 20 km search can time out on public infrastructure. | Add category guidance, progressive radius strategies, or background ingestion. | No |
| `tools/index.html` | The application shell is 374 KB and 5,662 lines with global functions/state. | Changes have a high regression surface and name collisions are difficult to detect. | Continue incremental module extraction by tool; do not rewrite wholesale. | No |
| `tools/index.html` | Legacy Local Gigs/Reddit/old Business Finder functions are unreachable and reference removed DOM/model fields. | Maintainers may mistake them for working features; invoking them manually fails. | Move the preserved Reddit flow into its own module or delete after product approval. | No |
| `tools/index.html` | Numerous inline `onclick` handlers and clickable `div` elements lack uniform keyboard semantics. | Keyboard and assistive-technology users cannot reliably operate parts of legacy tools. | Replace with buttons/listeners and add focus states during per-tool modernization. | No |
| `tools/index.html` | Many async legacy API flows lack consistent timeout/finally/error handling. | Buttons or loading panels can remain stuck after network failures. | Adopt the finder service pattern per legacy provider. | No |
| `test/local-business.test.js` | Tests cover Business Discovery but not the six legacy tools or production deployment integration. | Regressions outside the finder may reach production undetected. | Add browser smoke tests and serverless integration tests in CI. | No |

## Low

| File | Problem | User impact | Recommended fix | Block PR #2? |
|---|---|---|---|---|
| `index.html` | Marketing claims and tool counts are manually duplicated. | Copy can drift from the actual product. | Generate repeated copy from one data object during a future cleanup. | No |
| `tools/index.html` | Some icon/emoji-heavy labels and very small text reduce consistency. | Minor readability and product-polish issues. | Address in an accessibility-focused UI pass. | No |
| `assets/css/local-business-finder.css` | Styles are compressed into long lines and retain unused legacy badge classes. | Maintenance and reviews are harder. | Format and remove unused declarations separately. | No |
| `README.md` | It accurately documents provider limits but does not inventory every legacy browser API dependency. | New maintainers may underestimate migration scope. | Add a legacy API dependency matrix. | No |
| Repository root | No lint/format configuration or automated CI workflow exists. | Style and static-analysis regressions depend on manual checks. | Add lightweight linting and GitHub Actions after PR #2. | No |

## PR #2 merge assessment

All seven PR-specific High blockers identified above were fixed and covered by tests or browser verification. The remaining High findings are pre-existing legacy credential/XSS architecture risks and were not expanded by PR #2. They should be addressed next, but are not introduced by the provider fallback diff.
