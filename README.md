# Neary

Real-time transit PWA for Cluj-Napoca and other GTFS feeds, powered by the
separate [neary-gtfs](https://github.com/ciotlosm/neary-gtfs) data pipeline.

## Repository layout

| Path | What |
|---|---|
| [src/](src/) | v2 app — Svelte 5 + SvelteKit + Tailwind v4 + SQLite-WASM. Production target. |
| [legacy/](legacy/) | v1 app — React 19 + MUI. Frozen, currently still deployed to production until v2 cutover. |
| [docs/](docs/) | Architecture, concepts, standards, specs, plan, investigation |
| [scripts/](scripts/) | Local maintenance scripts |
| [.github/](.github/) | CI workflows — see [docs/specs/ci-and-versioning.md](docs/specs/ci-and-versioning.md) |

## Quick start

```bash
npm install
npm run dev          # v2 app on http://localhost:5173
npm test             # unit tests (legacy excluded)
npm run check        # svelte-kit sync + svelte-check
npm run build        # production build to ./build
```

Node 24+.

## Docs

Start at [docs/README.md](docs/README.md). Code is the source of truth for
behavior; docs cover what isn't obvious from reading [src/](src/).

## Deployment

Netlify auto-deploys `main`. See [docs/specs/ci-and-versioning.md](docs/specs/ci-and-versioning.md)
for the PR validation, auto-bump, and release flow.
