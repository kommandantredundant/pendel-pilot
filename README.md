# Pendel-Pilot

Pendel-Pilot plans the daily commute. It combines a home address, home station, work station, and work address and answers one question: when do I have to leave — on foot or by bike — to catch one of the next trains, to work and back home.

## Features

- Dashboards for both directions (`/towork`, `/tohome`) with walk and bike times at both ends.
- Every leg with track and real-time departure.
- **Glance** — a mobile countdown to the next departure.
- **Planner** — a desktop timeline for planning ahead.
- Dark mode, German and English, installable as a web app.

See the [changelog](./CHANGELOG.md) for what changed in each release.

## How it works

The UI is a React single-page app; the backend runs as Cloudflare Pages Functions. Journeys come from [Transitous](https://transitous.org), walking and cycling times from OSRM, and address search from Photon. The backend normalizes provider responses into a canonical journey model and handles caching, rate limits, and provider attribution.

The project merges two earlier prototypes: **fromhometowork** contributed the React UI, **dailyjourney** the backend.

- [Architecture](./docs/architecture.md) — data flow, API contracts, providers, storage, and operational constraints.
- [Decisions](./docs/decisions.md) — durable product and technical choices.

## Development

### Requirements

- Node.js 22 or newer

### Setup

```sh
npm install
npm run check
```

### Running locally

```sh
npm run dev:pages   # build the UI and serve UI + Functions on http://localhost:8788 (like production)
npm run dev         # Vite dev server with hot reload; proxies /api to a running `dev:pages` on :8788
```

Wrangler is not a dependency; the scripts fetch the pinned `wrangler@4.107.0` on demand.

### Project layout

| Path | Contents |
| --- | --- |
| `client/` | React UI (Vite, Tailwind, shadcn/ui, wouter, TanStack Query). Built into `dist/`. |
| `shared/` | Client-side schemas (settings, card model). |
| `functions/api/` | Cloudflare Pages Functions — the HTTP layer of the backend. |
| `src/` | Backend services, provider clients (Transitous, OSRM, Photon), and the canonical journey model. |
| `tests/` | Backend tests. Client tests live next to their modules as `client/src/**/*.test.ts`. |

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | Type-check backend (`tsconfig.json`) and client (`tsconfig.client.json`). |
| `npm run build` | Type-check and build the UI into `dist/`. |
| `npm test` | Run backend and client tests. |
| `npm run check` | Build and test — the gate for CI and deployment. |
| `npm run deploy:preview` | Build and deploy to the Cloudflare Pages `preview` branch. |
| `npm run deploy:production` | Build and deploy to the Cloudflare Pages `main` branch. |

### Releases and deployment

Pendel-Pilot runs as the Cloudflare Pages project `pendel-pilot`: static UI from `dist/`, API routes from `functions/api/`, configuration in `wrangler.toml`.

Publishing a GitHub release runs the workflow `Deploy production` (`.github/workflows/deploy-production.yml`). It checks out the release tag, runs `npm run check`, and deploys `dist/` and `functions/` to production. Pre-releases are not deployed. The workflow uses the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; the repository variable `CLOUDFLARE_PAGES_PROJECT_NAME` overrides the project name.

## Contributing

Contributions are welcome — bug reports, ideas, and pull requests alike.

1. Open an issue first for larger changes, so the approach can be discussed before you invest time.
2. Create a branch from `main` and keep each pull request focused on one change.
3. Add or update tests next to the code you change (`tests/` for the backend, `client/src/**/*.test.ts` for the client).
4. Run `npm run check` before pushing. CI runs the same check on every pull request, and it must pass before merging.
5. Note user-visible changes in [`CHANGELOG.md`](./CHANGELOG.md).
6. Product or technical choices that should last belong in [`docs/decisions.md`](./docs/decisions.md); changes to data flow, APIs, or providers in [`docs/architecture.md`](./docs/architecture.md).

By contributing, you agree that your contributions are licensed under the project's license.

## License

[Apache License 2.0](./LICENSE)

The train symbol and app icon use the "train" icon from [Tabler Icons](https://tabler.io/icons) (MIT License, © 2020–2024 Paweł Kuna).
