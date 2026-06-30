# GitHub Copilot instructions

Repo-scoped guidance loaded automatically by Copilot. The canonical
agent guide is [AGENTS.md](../AGENTS.md) — read that first.

## Quick rules

- **Read** [AGENTS.md](../AGENTS.md), [docs/README.md](../docs/README.md), and
  the file you're about to change. Don't skip.
- **Verify** before stating facts about code. Cite source paths.
- **Edit** existing files; create new ones only when necessary.
- **Minimal change** — don't refactor unrelated code or add speculative
  abstractions.
- **No comments** unless they explain a non-obvious WHY.
- **Source of truth = code.** Docs cover what isn't obvious from reading [src/](../src/).
- **Feed-agnostic.** No `if (feedId === ...)`, no per-agency hacks. GTFS
  spec violations get fixed in the producer, not here — see
  [docs/standards/feed-agnostic.md](../docs/standards/feed-agnostic.md).

## Placement (when adding a doc)

Follow the framework in [docs/standards/documentation.md](../docs/standards/documentation.md).
Pick exactly one of: `architecture/`, `concepts/`, `standards/`, `specs/`,
`plan/`, `investigation/`. If none fits cleanly, the doc shouldn't exist.

## CI

`npm run check && npm test && npm run build` must pass before pushing.
See [docs/specs/ci-and-versioning.md](../docs/specs/ci-and-versioning.md)
for the auto-version and deploy flow.

## Terminology

Use canonical names from [docs/concepts/terminology.md](../docs/concepts/terminology.md).
