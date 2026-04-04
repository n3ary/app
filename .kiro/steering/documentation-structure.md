# Documentation Structure

```
docs/
├── README.md              # Index with links to all docs
├── getting-started.md     # Setup, install, first run
├── user-guide.md          # End-user guide
├── developer-guide.md     # Architecture, patterns, deployment
├── changelog.md           # Last 2 weeks only
├── api-services.md        # Service layer reference
├── route-shapes.md        # Shape caching, distance calcs, debugging
└── troubleshooting/       # Split by category
    ├── README.md
    ├── common-issues.md
    ├── api-authentication.md
    ├── station-route-issues.md
    ├── mobile-pwa-issues.md
    ├── performance-caching.md
    ├── testing-development.md
    └── emergency-recovery.md
```

## Routing Rules

| Content type | Destination |
|-------------|-------------|
| Setup/install | `getting-started.md` |
| User features | `user-guide.md` + `changelog.md` |
| Architecture/patterns | `developer-guide.md` |
| API details | `api-services.md` |
| Route shapes | `route-shapes.md` |
| Bug fixes | appropriate `troubleshooting/` file |
| Temporary files | `temporary/` (git-ignored) |
| Conventions/principles | `.kiro/steering/` (not docs) |
| Feature designs | `.kiro/specs/` (not docs) |
