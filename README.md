# Pendel-Pilot

Pendel-Pilot plans the daily commute. It combines a home address, home station, work station, and work address and answers one question: when do I have to leave — on foot or by bike — to catch one of the next trains, to work and back home.

The project merges two earlier prototypes:

- **fromhometowork** contributed the React UI (dashboards for both directions, settings, plan-ahead, DE/EN, error display).
- **dailyjourney** contributed the backend (Cloudflare Pages Functions, canonical journey model, provider compliance, caching and resilience rules).

## Documentation

- [Architecture](./docs/architecture.md) — data flow, API contracts, providers, storage, and operational constraints.
- [Decisions](./docs/decisions.md) — durable product and technical choices.

## Layout

| Path | Contents |
| --- | --- |
| `client/` | React UI (Vite, Tailwind, shadcn/ui, wouter, TanStack Query). Built into `dist/`. |
| `shared/` | Client-side schemas (settings, card model). |
| `functions/api/` | Cloudflare Pages Functions — the HTTP layer of the backend. |
| `src/` | Backend services, provider clients (Transitous, OSRM, Photon), and the canonical journey model. |
| `tests/` | Backend tests. Client tests live next to their modules as `client/src/**/*.test.ts`. |

## Setup

Requires Node.js 22+.

```sh
npm install
npm run check
```

## Development

```sh
npm run dev:pages   # build the UI and serve UI + Functions on http://localhost:8788 (like production)
npm run dev         # Vite dev server with hot reload; proxies /api to a running `dev:pages` on :8788
```

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | Type-check backend (`tsconfig.json`) and client (`tsconfig.client.json`). |
| `npm run build` | Type-check and build the UI into `dist/`. |
| `npm test` | Run backend and client tests. |
| `npm run check` | Build and test — the gate for CI and deployment. |
| `npm run deploy:preview` | Build and deploy to the Cloudflare Pages `preview` branch. |
| `npm run deploy:production` | Build and deploy to the Cloudflare Pages `main` branch. |

## Deploy

Pendel-Pilot runs as the Cloudflare Pages project `pendel-pilot`: static UI from `dist/`, API routes from `functions/api/`, configuration in `wrangler.toml`.

```sh
npx wrangler@4.107.0 login                                        # once
npx wrangler@4.107.0 pages project create pendel-pilot --production-branch main   # once
npm run deploy:production
```

Wrangler is not a dependency; deploy scripts fetch the pinned `wrangler@4.107.0` on demand. The GitHub workflow `Deploy production` does the same with `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_PAGES_PROJECT_NAME` secrets.
