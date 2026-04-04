# Route Shapes System

Architecture and design details are in the spec: `.kiro/specs/bulk-shape-caching/design.md`

This doc covers runtime behavior, distance calculations, and debugging — things not in the spec.

## Distance Calculation Methods

**With Route Shape (High Confidence ±50m):**
1. Project vehicle position onto route shape
2. Project target stop onto route shape
3. Calculate distance along shape between projections

**Without Route Shape (Medium Confidence ±200m — Fallback):**
1. Sum distances between consecutive intermediate stops

The fallback triggers automatically when `routeShape` is undefined in `calculateVehicleArrivalTime()`.

## Why Shapes Store Might Be Empty

| Scenario | Cause | Resolution |
|----------|-------|------------|
| First load | No localStorage yet | Wait for `initializeShapes()` |
| Network error | API unreachable / 30s timeout | Retry with backoff, use fallback calculations |
| Invalid data | Malformed API response | Filter invalid shapes, log warning |
| Storage full | localStorage quota exceeded | Clear old cache, continue in-memory |
| Stale (>24h) | Cache expired | Use cached data while background refresh runs |

## Performance Characteristics

| Aspect | Value |
|--------|-------|
| Shape lookup | O(1) via Map |
| Hash generation | O(n), n = total shape points |
| Shape projection | O(m), m = segments in shape |
| Typical memory | 5-15MB for all shapes |
| Typical network | 2-5MB first load, 0 after cache |
| Typical CPU | <100ms for all calculations |

## Debugging

```typescript
// Check store state
const s = useShapeStore.getState();
console.log('Count:', s.shapes.size, 'Updated:', new Date(s.lastUpdated), 'Hash:', s.dataHash, 'Error:', s.error);

// Check localStorage
const p = JSON.parse(localStorage.getItem('shape-store'));
console.log('Cached:', p.state.shapes.length);
```
