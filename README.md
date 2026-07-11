# FirstCustomer

FirstCustomer is currently deployed as a static, framework-free HTML/CSS/JavaScript application. The root landing page links to the application at `/tools`.

## Local Business Finder Architecture Notes

- **Structure:** `index.html` is the marketing page. `tools/index.html` contains the application shell, all legacy tool markup, styles, and JavaScript. Navigation uses `switchPage()` to toggle `.page` and `.top-nav-btn` classes; there is no client-side router.
- **Preserved tools:** Signal Hunter, Rank Tracker, YouTube Studio, Content Studio, Lead Finder, and SEO Guide remain in the legacy application file. The former Reddit gig scanner is preserved in the legacy Local Gigs functions but hidden from the Local Business Finder UI because moving it into Lead Finder would create unnecessary regression risk in this sprint.
- **Local Business Finder:** The new light UI remains mounted at `page-localGigs` for navigation compatibility. Its CSS and JavaScript are isolated under `assets/`. Search, filtering, rendering, configuration, and service concerns are separate modules. This is a safe first extraction; the remaining tools can be modularised incrementally.
- **Google Places:** The former browser-side Google Places API (New) request was removed. The frontend now posts only to `/api/local-businesses/search`. The Vercel function at `api/local-businesses/search.js` reads `GOOGLE_PLACES_API_KEY` server-side, validates input, limits responses to 20, normalises results, and never returns the key. Website reachability is intentionally `unknown` until a later server-side audit sprint.
- **Deployment:** No framework or build configuration exists. Vercel serves the static files and automatically exposes the `api/` JavaScript file as a serverless function. No production domain settings are stored or changed in this repository.
- **Browser storage:** `tools/index.html` uses localStorage for Anthropic, Google/YouTube, Google Custom Search, Google Website Custom Search, and SerpAPI keys, plus products, feedback, posted counts, onboarding status, profile, activity, wins, and saved leads. Existing keys are user-provided and remain browser-readable for legacy features; no secret values are committed. The Local Business Finder does not use browser-stored API keys.
- **Security follow-up:** Legacy tools still call Anthropic, YouTube, Google Custom Search, Reddit, and proxy services directly from the browser. Migrating those calls behind server routes is outside this task but is recommended. Add rate limiting and abuse monitoring to the Places endpoint before increasing public traffic.

### Environment

Set `GOOGLE_PLACES_API_KEY` in Vercel for the Local Business Finder. Enable **Places API (New)** for that restricted server-side key. When absent, the endpoint returns a safe configuration response and the UI shows a friendly setup message.
