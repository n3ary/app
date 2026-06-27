# Neary docs

Source of truth for how this project is structured, named, and decided.
Code is the source of truth for behavior — these docs only capture what
isn't obvious from reading [src/](../src/).

## Layout

| Path | Contains |
|---|---|
| [architecture/](architecture/) | What the system IS now — stack, components, data pipeline |
| [concepts/](concepts/) | Vocabulary — vehicle, buckets, confidence, feeds, prediction |
| [standards/](standards/) | MUST / MUST NOT rules — short, enforceable |
| [specs/](specs/) | Contracts where the reasoning isn't in the code |
| [plan/](plan/) | Roadmap and in-flight design — short-lived |
| [investigation/](investigation/) | Historical analyses and the frozen v1 docs |

## Conventions

- Every directory has a `README.md` that links its contents.
- Files use lowercase kebab-case; `README.md` is the only uppercase file.
- Cross-references use relative paths to the smallest useful target.
- Anything that becomes obvious from code or grows stale is deleted, not preserved.
- See [standards/documentation.md](standards/documentation.md) for the placement rules.

## How to read this repo as an agent

1. Start at the root [README.md](../README.md).
2. For "what does the system do" → [architecture/system-overview.md](architecture/system-overview.md).
3. For "what does this term mean" → [concepts/](concepts/).
4. For "what is the rule" → [standards/](standards/).
5. For "what are we building next" → [plan/](plan/).
6. For "what does the code do" → read the code. Specs only exist where reasoning isn't there.
