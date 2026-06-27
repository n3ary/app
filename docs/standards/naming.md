# Naming

## Files and directories

- Lowercase kebab-case for content files (`vehicle-card.svelte`, `predict-eta.ts`).
- `README.md` is the only uppercase file in this repo.
- Test files mirror the source path under the same directory, suffix `.test.ts`.

## Svelte files

- Components: `PascalCase.svelte` (`StationCard.svelte`, `VehicleCard.svelte`).
- Routes: kebab-case directories with `+page.svelte` / `+layout.svelte`
  per SvelteKit convention.
- Stores: lowercase + `.svelte.ts` extension (`userPrefs.svelte.ts`,
  `feedsStore.svelte.ts`).

## TypeScript

- Functions and variables: `camelCase`.
- Types and components: `PascalCase`.
- Constants exported from `lib/domain/config.ts`: `SCREAMING_SNAKE_CASE` when
  they're truly invariant; `camelCase` when they're config knobs.
- No Hungarian notation (`strFoo`, `iCount`).

## Domain identifiers

See [../concepts/terminology.md](../concepts/terminology.md).
