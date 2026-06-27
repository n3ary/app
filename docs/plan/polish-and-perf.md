# Polish and perf (Phase 9)

Things deferred until after the data + prediction stack lands.

## Tooling

- **Biome adoption** — replace any remaining ESLint/Prettier config with Biome (one tool, faster).
- **Histoire / Playwright screenshot regression** — Phase 1 follow-up. Currently the `/showcase` route serves as the manual sandbox; switch to automated screenshot diffing once Histoire's Svelte 5 support stabilizes.

## Performance

- **Per-route perf budgets enforced in CI** — fail builds that exceed targets (e.g. > 50 KB JS gzipped on first paint).
- **Cold-start measurement** — target < 1 s to interactive on mid-range iPhone Safari.
- **Time-to-first-station-card** — target < 250 ms when schedule is cached.

## Install / distribution

- **Apple PWA install polish** — proper icons, splash screens, screenshots in `manifest.json`.
- **iOS PWA tips** — first-launch hint to add to home screen.

## Out of scope for Phase 9

- Apple App Store wrapper (separate effort if ever pursued).
- Push notifications.
- Background sync.
