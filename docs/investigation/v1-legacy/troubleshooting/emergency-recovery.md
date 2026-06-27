# Emergency Recovery Procedures

## Complete App Reset

### Nuclear Option - Full Reset
**When to use**: App completely broken, nothing else works

**Steps**:
1. **Clear all browser data** for the site
2. **Unregister service workers**
3. **Clear localStorage and caches**
4. **Hard refresh** (Ctrl+Shift+R)
5. **Restart browser**
6. **Re-setup** API key and configuration

### Browser Console Reset
```javascript
// Complete reset (paste in browser console)
localStorage.clear();
sessionStorage.clear();
caches.keys().then(names => Promise.all(names.map(name => caches.delete(name))));
navigator.serviceWorker.getRegistrations().then(registrations => {
  registrations.forEach(registration => registration.unregister())
});
location.reload(true);
```

## Recovery Scenarios

### App Won't Load
1. Hard refresh (Ctrl+Shift+R)
2. Clear browser cache
3. Disable browser extensions
4. Try incognito/private mode
5. Use different browser

### Infinite Loading
1. Check network connection
2. Clear service worker cache
3. Disable service worker
4. Use mobile data instead of WiFi

### Setup Loop
1. Clear localStorage
2. Delete API key from browser storage
3. Restart setup process
4. Verify API key is valid

### Data Corruption
1. Export favorites (if possible)
2. Clear all app data
3. Re-setup from scratch
4. Re-import favorites

## Last Resort

### Complete Browser Reset
1. Close all browser tabs
2. Clear all browsing data
3. Restart browser
4. Disable all extensions
5. Try app in clean state

### Different Device/Browser
1. Try on mobile device
2. Use different browser
3. Use incognito mode
4. Check if issue is device-specific

## Prevention

### Regular Maintenance
- Clear cache monthly
- Update browser regularly
- Monitor storage usage
- Backup favorite routes

### Early Warning Signs
- Slow loading times
- Inconsistent data
- Storage quota warnings
- Service worker errors