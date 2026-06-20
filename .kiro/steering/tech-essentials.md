# Tech Essentials

## Stack
- **React 19.2.0** + TypeScript + Vite
- **Material-UI 7.3.6** for components and styling (exclusive)
- **Zustand 5.0.9** for state (minimal stores)
- **Vitest** for testing

## Commands
```bash
npm run dev          # Start dev server (port 5175)
npm test             # Run tests (--run already included)
npm test -- pattern  # Run specific tests (NO --run needed)
npm run build:prod   # Production build with version update
npm run analyze      # Codebase analysis
npm run test:performance  # Performance testing
```

## File Organization
```
src/
├── components/      # React components
├── stores/          # Zustand stores (minimal)
├── services/        # API services
├── hooks/           # Custom hooks
├── utils/           # Pure utilities
├── types/           # TypeScript types
└── test/            # ALL tests, mirroring the source path + shared setup/fixtures
```

## Testing
- **Location**: Tests live under `src/test/`, NOT co-located next to source. Mirror the source path: a test for `src/utils/schedule/foo.ts` goes in `src/test/utils/schedule/foo.test.ts`.
- **Shared infra**: `src/test/setup.ts`, `src/test/testConstants.ts` hold shared setup/fixtures.
- **Naming**: `*.test.ts` for example/unit tests; `*.property.test.ts` for fast-check property tests (min 100 runs).
- Note: some pre-existing tests are still co-located; migrate them to `src/test/` when touched.

## Store Persistence
- Use Zustand `persist`. For large persisted payloads, use the shared **`createCompressedStorage`** adapter (`src/utils/core/compressedStorage.ts`, gzip via `compressionUtils`) wrapped in `createJSONStorage`.
- Do NOT introduce a new storage mechanism (e.g. a bespoke IndexedDB adapter) without justification and a steering update — reuse the compressed-localStorage approach.

## Key Rules
- **Test timeout**: Cancel tests after 1 minute
- **Test location**: Under `src/test/` mirroring source path (see Testing)
- **File size**: Split at 300 lines with clear boundaries
- **API source**: Tranzy API for all transit data
- **Import paths**: Use existing patterns from codebase
- **Persistence**: Reuse `createCompressedStorage` for large persisted stores (see Store Persistence)