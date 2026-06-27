# Performance & Caching Issues

## Browser Freeze Issues

### Browser Freezes on App Load or Settings Navigation (FIXED)
**Problem**: Browser becomes completely unresponsive when opening the app or navigating through settings
**Root Cause**: Massive unfiltered stopTimes API queries downloading entire agency datasets (thousands of records)
**Solution**: Fixed in December 2024 - stopTimes queries now use proper tripId/stopId filtering
**Status**: ✅ RESOLVED - Update to latest version

## Storage Problems

### Route Shapes localStorage Failure (FIXED)
**Problem**: "Shapes store empty" with stack overflow and QuotaExceededError
**Root Cause**: Large shape data (13.1MB) caused stack overflow in compression and exceeded localStorage limits
**Solution**: Fixed compression with chunked processing + gzip compression (13.1MB → 2.0MB, 6.6x reduction)
**Technical Fix**: Replaced `String.fromCharCode(...array)` with chunked approach to avoid stack overflow
**Status**: ✅ RESOLVED - Compression now handles large datasets without errors

### Storage Quota Exceeded
**Problem**: "QuotaExceededError: The quota has been exceeded"
**Solution**: Clear browser data or restart browser. Cache now auto-manages size.

### Cache Inconsistency
**Problem**: Different data in different tabs or after refresh
**Solution**: Clear all caches and restart browser

**Clear All Caches (Browser Console)**:
```javascript
// Clear localStorage
localStorage.clear();

// Clear service worker caches
caches.keys().then(names => Promise.all(names.map(name => caches.delete(name))));

// Unregister service workers
navigator.serviceWorker.getRegistrations().then(registrations => {
  registrations.forEach(registration => registration.unregister())
});
```

## Performance Issues

### Slow Loading
**Problem**: App takes long time to load or respond
**Solution**: Check network connection, clear cache, or restart browser

### Memory Issues
**Problem**: Browser becomes unresponsive or crashes
**Solution**: Close other tabs, restart browser, or reduce cache size

### Performance Memory Threshold Alerts (FIXED)
**Problem**: Console shows "Memory usage increase alert" with 167MB usage vs 100MB threshold
**Root Cause**: Performance monitoring thresholds were set too low for realistic production usage
**Solution**: Fixed in December 2024 - Memory thresholds increased to 200MB base, 300MB alert threshold
**Status**: ✅ RESOLVED - Update to latest version

### JavaScript Heap Out of Memory (FIXED)
**Problem**: "FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory"
**Solution**: This critical memory leak in useVehicleDisplay hook has been fixed (Dec 18, 2024). Update to latest version.

### Infinite Loops
**Problem**: Browser crashes with excessive logging
**Solution**: Check React useEffect dependencies and callback stability

### Maximum Update Depth Exceeded (FIXED)
**Problem**: "Maximum update depth exceeded" error causing browser crashes
**Root Cause**: useNearbyViewController had processNearbyView in useEffect dependencies, causing infinite re-renders
**Solution**: Fixed in December 2024 - Function stored in useRef to break dependency cycle
**Status**: ✅ RESOLVED - Update to latest version

## Service Worker Issues

### Stale Data
**Problem**: App shows old data despite refresh
**Solution**: Unregister service worker and hard refresh (Ctrl+Shift+R)

### Update Not Working
**Problem**: App doesn't update to new version
**Solution**: Clear service worker cache and reload

## Quick Fixes

### Hard Refresh
- **Chrome/Firefox**: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
- **Safari**: Cmd+Option+R

### Clear Site Data
1. Open browser settings
2. Find "Clear browsing data" or "Storage"
3. Select this site only
4. Clear all data types
5. Restart browser