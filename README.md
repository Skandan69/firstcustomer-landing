# FirstCustomer

## Persistence foundation

Sprint 3 adds server-only Supabase persistence for businesses, saved leads, search history, saved searches, lead notes, and activity events. Apply `supabase/migrations/202607120001_persistence_foundation.sql`, then configure these Vercel variables for both Preview and Production:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The service-role key is used only by Vercel functions and must never use a `VITE_`, `NEXT_PUBLIC_`, or other browser-exposed prefix. Row-level security is enabled with no public policies. Until authentication is introduced, records are scoped to an anonymous UUID stored as `fc_workspace_id` in the browser. Clearing browser storage or changing devices creates a different workspace.

The canonical business model is implemented in `api/local-businesses/business-model.js` and is shared by Google Places, OpenStreetMap, and persistence.

## Website Intelligence Engine

Sprint 4 adds a rule-based, server-side website audit for businesses that publish a website URL. The browser calls only `POST /api/website-audits`; the Vercel function validates the target, blocks private-network and nonstandard-port requests, follows at most five safe redirects, limits response size, and applies timeouts. It fetches the main page plus `robots.txt` and `sitemap.xml` with an identifying FirstCustomer user agent.

The engine is modular:

- `server/website-intelligence/fetcher.js` handles public-URL safety, redirects, timeouts, and bounded downloads.
- `server/website-intelligence/parser.js` detects health, SEO, conversion, trust, and basic accessibility signals without executing website scripts.
- `server/website-intelligence/scoring.js` produces a transparent opportunity score and recommendations. A higher opportunity score means more important gaps were detected; the complementary health score shows the current foundation.
- `server/website-intelligence/audit.js` orchestrates public-file checks, parsing, and scoring.
- `server/website-intelligence/repository.js` stores and retrieves audit summaries through server-only Supabase access. Keeping helpers outside `api/` ensures Vercel deploys only the public route as a Serverless Function.

Apply `supabase/migrations/202607130001_website_intelligence.sql` before deploying the feature. Audits are scoped to the anonymous local workspace and reused for 24 hours. The **Refresh audit** action explicitly bypasses that recent-audit cache. The audit is a fast structural inspection, not a full browser crawl: it does not execute JavaScript, measure Core Web Vitals, validate every schema object, inspect certificate expiry, or crawl secondary pages.

## Google Analytics 4

GA4 is configured centrally in `assets/js/analytics.js` with measurement ID `G-WKVRV08E16`. Each HTML entry page loads this shared utility once; feature modules must not add Google scripts or call `gtag` directly.

Track supported product events with `analytics.track('save_lead', { source: 'local_business_finder' })`. Supported events are `page_view`, `business_search`, `save_lead`, `remove_lead`, `save_search`, `generate_audit`, `generate_website`, and `proposal_generated`. Event calls are exception-safe and become harmless no-ops if analytics initialization is unavailable.

Never include business names, phone numbers, email addresses, addresses, website URLs, notes, workspace IDs, exact search locations, or other personal data in analytics properties.

FirstCustomer is a framework-free HTML/CSS/JavaScript application. The root landing page links to the application at `/tools`; Vercel serves static assets and functions under `api/`.

## Local Business Finder Architecture Notes

- `tools/index.html` contains the legacy application shell and its seven tab panels. `switchPage()` toggles active page/navigation classes; there is no client router.
- The Local Business Finder remains mounted at the legacy `page-localGigs` ID for compatibility, while its controller, service, filters, renderer, configuration, and styles live under `assets/`.
- Signal Hunter, Rank Tracker, YouTube Studio, Content Studio, Lead Finder, SEO Guide, and the hidden legacy Reddit gig implementation remain intact. Moving the Reddit implementation was deferred to avoid regression risk.
- The browser calls only `POST /api/local-businesses/search`. Google Places credentials never enter the Local Business Finder browser code.
- Legacy features still store user-entered API keys and application data in localStorage. Those calls should be migrated behind server routes separately.

## Business Discovery provider architecture

The browser always calls `POST /api/local-businesses/search` and consumes one provider-independent business model. It never calls Google, Nominatim, or Overpass directly.

- **Auto:** attempts Google Places first. Configuration, billing, permission, quota, or temporary Google failures fall back to OpenStreetMap. A response contains only one provider and includes a visible fallback notice.
- **Google:** uses Places API (New) only and supports Google pagination, ratings, and review counts.
- **Open Data:** geocodes the entered location with Nominatim, then searches the selected radius with Overpass. It returns OpenStreetMap tags and public contact details when contributors supplied them.

Open Data results do not contain Google ratings, review counts, or business status. Phone, address, opening hours, and website coverage can be incomplete. Category filtering operates on available OSM names and tags.

### Category relevance contract

`shared/business-categories.json` is the single category registry used by Google search-term construction, OpenStreetMap tag queries, result classification, and browser autocomplete. Recognized categories query only their mapped OSM tags across nodes, ways, and relations. Every targeted Open Data result is then checked again against the raw OSM tags or a strong, non-excluded business-name keyword before normalization.

The previous provider-local alias table could not enforce relevance across the full request path: unmapped input was converted into speculative values for multiple OSM namespaces, post-filtering inferred relevance from normalized names/types instead of retaining raw match evidence, and the UI received no matched-category or confidence metadata. Auto fallback preserved the category string, but there was no shared contract proving that returned records matched it. The v2 Open Data cache key, exact tag registry, mandatory post-query classifier, and match metadata close that gap. Targeted searches now prefer zero results to unrelated points of interest.

Custom categories never trigger an all-POI query. They use conservative name filtering in Overpass and must pass the same post-query keyword threshold. The UI labels these searches as best effort because OpenStreetMap coverage is not complete.

## Local Business Finder setup

### Required environment variable

Set `GOOGLE_PLACES_API_KEY` in Vercel and in `.env.local` for local Vercel development. Never prefix it with `VITE_`, `NEXT_PUBLIC_`, or otherwise expose it to browser code.

The variable must be enabled separately for every Vercel environment that needs it (Preview and/or Production). After adding or changing it, redeploy the branch because existing deployments do not receive newly added variables retroactively. The API logs only whether the variable exists; it never logs its value.

### Google Cloud checklist

1. Create or select a Google Cloud project with billing enabled.
2. Enable **Places API (New)**.
3. Create a server-side API key.
4. Restrict the key to Places API (New), and use appropriate application restrictions for the deployment architecture.
5. Add the key to the Vercel project as `GOOGLE_PLACES_API_KEY` for Preview and Production as required.

### Local testing

Use `vercel dev` so static files and the API route run together. Then call:

```sh
curl -X POST http://localhost:3000/api/local-businesses/search \
  -H "Content-Type: application/json" \
  -d '{"location":"Malkajgiri, Hyderabad","category":"","radiusKm":5,"provider":"auto"}'
```

Run the lightweight test suite with `npm test`.

## Tool-suite provider configuration

Paid provider credentials are server-side only. The browser reads boolean readiness from `GET /api/tool-suite?action=configuration` and never receives secret values. The tool-suite actions share one function so the project remains deployable within Vercel Hobby's function limit.

- `ANTHROPIC_API_KEY` — Content Studio and optional Signal/Lead AI assistance
- `ANTHROPIC_MODEL` — optional model override
- `SERPAPI_KEY` — automatic Rank Tracker position checks
- `YOUTUBE_API_KEY` — live YouTube research and trending data
- `GOOGLE_SEARCH_API_KEY` plus `GOOGLE_SEARCH_ENGINE_ID` (or `GOOGLE_SEARCH_CX`) — optional Signal Hunter Google results
- `GOOGLE_PLACES_API_KEY` — Google Local Business Finder
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` — persistence

Legacy paid keys already stored by older browser versions are not silently deleted, but current code never reads or transmits them. See `docs/TOOL_SUITE_STATUS.md` for exact tool readiness and limitations.

### Behaviour and limitations

- Category is optional. Without it, the query is `businesses in {location}`; Google decides which representative businesses to return. This is not an exhaustive directory of every business in the area.
- Radius values are validated and retained in the API contract. Places Text Search interprets the named location; enforcing a precise radius will require a later geocoding step and `locationBias` circle.
- Results are normalised to a stable internal model. A missing website is `no_website`; a listed website is `not_checked`. The UI never labels a site broken, outdated, or poor before an audit.
- Google pagination tokens are passed through the server. The browser appends pages, removes duplicate place IDs, and recalculates summary metrics across the complete loaded set.
- Nominatim requests use an identifying User-Agent, a per-instance one-request-per-second gate, and a 24-hour geocode cache. Overpass results are cached for 10 minutes, use a bounded 22-second failover window across current HTTPS mirrors, and time out gracefully before the browser request deadline. The currently responsive `gall.openstreetmap.de` backend is used as the documented round-robin outage workaround; the retired `overpass.kumi.systems` hostname is not used.
- All caches and the per-IP throttle are best-effort per warm serverless instance. Durable production caching and rate limits require Redis, Vercel KV, or another persistent store. Public OpenStreetMap services are suitable as a development fallback, not unlimited high-volume infrastructure.
- A future sprint will add a server-side website-audit engine. AI scoring and website generation are intentionally not part of this foundation.
