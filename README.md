# FirstCustomer

## Persistence foundation

Sprint 3 adds server-only Supabase persistence for businesses, saved leads, search history, saved searches, lead notes, and activity events. Apply `supabase/migrations/202607120001_persistence_foundation.sql`, then configure these Vercel variables for both Preview and Production:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The service-role key is used only by Vercel functions and must never use a `VITE_`, `NEXT_PUBLIC_`, or other browser-exposed prefix. Row-level security is enabled with no public policies. Until authentication is introduced, records are scoped to an anonymous UUID stored as `fc_workspace_id` in the browser. Clearing browser storage or changing devices creates a different workspace.

The canonical business model is implemented in `api/local-businesses/business-model.js` and is shared by Google Places, OpenStreetMap, and persistence.

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

### Behaviour and limitations

- Category is optional. Without it, the query is `businesses in {location}`; Google decides which representative businesses to return. This is not an exhaustive directory of every business in the area.
- Radius values are validated and retained in the API contract. Places Text Search interprets the named location; enforcing a precise radius will require a later geocoding step and `locationBias` circle.
- Results are normalised to a stable internal model. A missing website is `no_website`; a listed website is `not_checked`. The UI never labels a site broken, outdated, or poor before an audit.
- Google pagination tokens are passed through the server. The browser appends pages, removes duplicate place IDs, and recalculates summary metrics across the complete loaded set.
- Nominatim requests use an identifying User-Agent, a per-instance one-request-per-second gate, and a 24-hour geocode cache. Overpass results are cached for 10 minutes and time out gracefully.
- All caches and the per-IP throttle are best-effort per warm serverless instance. Durable production caching and rate limits require Redis, Vercel KV, or another persistent store. Public OpenStreetMap services are suitable as a development fallback, not unlimited high-volume infrastructure.
- A future sprint will add a server-side website-audit engine. AI scoring and website generation are intentionally not part of this foundation.
