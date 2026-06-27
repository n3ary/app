# Testing & Development Issues

## React Component Issues

**Problem**: Maximum update depth exceeded
**Solution**: Check for circular useEffect dependencies. Store functions in useRef to break cycles.

**Problem**: Leaflet map container reuse error
**Solution**: Add unique key prop to MapContainer, ensure proper cleanup in useEffect.

## Test Performance

**Problem**: JavaScript heap out of memory during tests
**Solutions**:
- Reduce mock data sizes in MSW handlers (3-5 items, not 15-30)
- Use `pool: 'forks'` with `singleFork: true` in vitest config
- Reset all stores and clear localStorage in `afterEach`
- Use short timeouts for network error tests (1000ms)

**Problem**: Slow individual tests (5-10s)
**Solutions**:
- Mock heavy operations (logger, expensive utils)
- Use `createMockData` helpers instead of fast-check generators for unit tests
- Run heavy integration tests only in CI with `test.skip`

## Memory Leaks in Tests

**Problem**: Memory growing across tests
**Solutions**:
- Complete store reset in `beforeEach` (all stores to initial state)
- Clear `localStorage` and `sessionStorage`
- Clear unified cache: `unifiedCache.clear()`

## Cache-Related Test Failures

**Problem**: Tests failing from cached data leaking between tests
**Solution**: Clear unified cache in `beforeEach`, or mock the cache module entirely.

## Property-Based Test Failures

**Problem**: Generated data doesn't match real API constraints
**Solution**: Constrain generators to realistic bounds (e.g., lat 46.7-46.8, lon 23.5-23.7).

## Quick Fixes

```bash
# Increase Node memory (temporary)
node --max-old-space-size=4096 node_modules/.bin/vitest --run

# Run specific test files
npm test -- vehicleStore

# Verbose timing
npm test -- --reporter=verbose
```

## Test Size Guidelines
- Unit tests: < 100ms each
- Integration tests: < 500ms each
- Total suite: < 30 seconds
