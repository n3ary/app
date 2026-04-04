# Documentation Guidelines

## Documentation Placement

Three tiers, each with a clear purpose:

| Tier | Purpose | Consumer | Update pattern |
|------|---------|----------|----------------|
| **Code** (`src/`) | Implementation details, type definitions, inline comments | Agents reading code | Updated with code changes |
| **Docs** (`docs/`) | Architecture decisions, user guides, troubleshooting | Humans + agents needing context beyond code | Manually maintained |
| **Steering** (`.kiro/steering/`) | Cross-cutting rules, conventions, principles | Agents on every interaction | Updated when conventions change |
| **Specs** (`.kiro/specs/`) | Feature designs, requirements, task lists | Agents during feature work | Created per feature, archived when done |

### Decision Framework

Before writing documentation, ask:

1. **Is this readable from code?** → Don't document it. Code is the source of truth for implementation.
2. **Is this a convention or principle?** → Steering file.
3. **Is this a feature design?** → Spec.
4. **Is this architecture, user-facing, or troubleshooting?** → Docs.
5. **Is this a one-time artifact (migration, benchmark, verification)?** → Don't write it. Git history is enough.
6. **Is this a restatement of library/vendor docs?** → Link to the official source. Document only our decisions on top.

## Content Rules

- NEVER create markdown files in project root (except README.md)
- Update existing files, don't create new ones
- Keep files under 300 lines
- Prefer tables over prose for reference data
- Prefer code paths over code examples (e.g., "see `src/utils/core/constants.ts`" not copying constants)
- Keep docs scannable: short sections, clear headers, no emoji walls
- Every `docs/` subdirectory must have a README.md index as a table of `| Document | Description |`

## What NOT to Document

- Implementation details readable from code (hook internals, store logic, component props)
- One-time migration artifacts or verification results (use git history)
- Performance benchmarks without automated SDLC integration
- Feature backlogs or deferred ideas (use specs or issue tracker)
- Content already in `.kiro/steering/` or `.kiro/specs/`
- Tutorials for public libraries (link to official docs, document only our delta)
- Temporal artifacts (investigation notes, spike results) — use `temporary/` folder

## Changelog

- Keep last 2 weeks only, git handles history
- Format: one line per change, `**TYPE**: Description`
- Archive by deleting

## Troubleshooting Entries

- Format: `**Problem**: Brief description` / `**Solution**: One-line fix`
- Max 3 lines per issue
- Mark resolved issues with `(FIXED)` and delete after 1 month
