# Developer Guide

## Deployment Policy

**NEVER deploy to production automatically.**
Make changes → test locally → commit & push → wait for explicit deploy request → `netlify deploy --prod`.

## Architecture

### Data Flow
```
User Action / Event → Component → Store Action → isDataFresh() check
  → Fresh: use cache
  → Stale: call Service → API (axios) → Store update → Re-render
```

### Refresh Strategy
Event-driven, no polling. Triggers: component mount, visibility change, network status change, manual refresh.

### Cache Durations (from `src/utils/core/constants.ts`)
| Data | Duration | Persistence |
|------|----------|-------------|
| Vehicles | 30s | In-memory |
| Routes | 5min | In-memory |
| Route mapping | 5min | In-memory |
| Stop times | 24h | localStorage |
| Trips | 24h | localStorage |
| Shapes | 24h | localStorage + gzip |

### Error Handling
- Exponential backoff: ShapeStore uses 3 attempts [100ms, 200ms, 400ms]
- Network error detection checks for 'network', 'connection', 'timeout', 'fetch'
- Stores prevent duplicate requests via `if (currentState.loading)` check
- `apiStatusTracker` records success/failure with response times

## API Integration

Single source: Tranzy API via `enhancedTranzyApi` singleton.
Endpoints: `/api/tranzy/v1/opendata/*`

Services in `src/services/`: vehicleService, stationService, routeService, tripService, agencyService, shapesService, arrivalService, locationService.

## Key Patterns

### State Management
Zustand stores with `isDataFresh()` guards. Trip/Shape stores use `persist` middleware for localStorage. ShapeStore uses gzip compression.

### Performance
- Shape deduplication in `routeShapeService`
- `useDebouncedLoading` hook (300ms) prevents flicker
- `useStationFilter` debounces with vehicle-to-station indexing (O(n+m) vs O(n×m))

### Route Shapes System
See [route-shapes.md](route-shapes.md) for distance calculations, fallback behavior, and debugging. Architecture details are in `.kiro/specs/bulk-shape-caching/design.md`.

## Debugging

- `/debug.html` — API testing page
- Browser console for error logs
- Network tab for API inspection

## Build & Deploy

```bash
npm run build        # Production build → dist/
npm run preview      # Test production build locally
netlify deploy       # Preview deployment
netlify deploy --prod  # Production (ONLY when requested)
```

Environment: `VITE_TRANZY_API_BASE_URL` for API base URL.
