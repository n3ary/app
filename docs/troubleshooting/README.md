# Troubleshooting

| Document | Description |
|----------|-------------|
| [common-issues.md](common-issues.md) | Setup, data, UI, and performance problems |
| [api-authentication.md](api-authentication.md) | Auth errors, network issues, debug tools |
| [station-route-issues.md](station-route-issues.md) | Station display, route management, vehicle filtering |
| [mobile-pwa-issues.md](mobile-pwa-issues.md) | Mobile browser, PWA install, touch, theme |
| [performance-caching.md](performance-caching.md) | Storage quota, cache, memory, service worker |
| [testing-development.md](testing-development.md) | Test failures, memory leaks, dev server |
| [emergency-recovery.md](emergency-recovery.md) | Full reset, last resort procedures |

## Quick Diagnostic

1. Refresh page (F5)
2. Hard refresh (Ctrl+Shift+R / Cmd+Shift+R)
3. Clear browser cache
4. Try incognito mode

## Emergency Reset (browser console)

```javascript
localStorage.clear();
caches.keys().then(names => Promise.all(names.map(name => caches.delete(name))));
location.reload(true);
```
