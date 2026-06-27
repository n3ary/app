# API & Authentication Issues

## Authentication Errors

### "API request without authentication"
**Problem**: 403 errors despite valid API key
**Cause**: Timing issue - data hooks run before API key is configured
**Solution**: Refresh page after setup, or wait for initialization to complete

### Context Error on App Start
**Problem**: Station view shows context error instead of "Please configure API key" message
**Cause**: Missing API configuration check in StationView component
**Solution**: Added API key validation before loading data, matching RouteView pattern

### Invalid API Key
**Problem**: "Invalid API key" or 401 errors
**Solution**: 
1. Verify API key is correct (no extra spaces)
2. Check API key hasn't expired
3. Test with debug tool at `/debug.html`

### API Key Not Saving
**Problem**: API key doesn't persist after refresh
**Solution**: Check browser allows localStorage, disable private browsing

## Network Issues

### Production API Returns HTML Instead of JSON
**Problem**: API calls return HTML error pages in production, causing "TypeError: e.map is not a function"
**Cause**: Netlify catch-all redirect intercepts API calls before proxy rules
**Solution**: Ensure API proxy redirects come BEFORE SPA redirect in netlify.toml

### Connection Timeout
**Problem**: Requests timeout or fail to connect
**Solution**: 
1. Check internet connection
2. Try mobile data instead of WiFi
3. Check if Tranzy API is down
4. Disable VPN/proxy

### CORS Errors
**Problem**: Cross-origin request blocked
**Solution**: Use development server (npm run dev) - production handles CORS properly

### Rate Limiting
**Problem**: "Too many requests" errors
**Solution**: Wait a few minutes before retrying, reduce refresh frequency

## Data Issues

### No Data Returned
**Problem**: API returns empty arrays
**Cause**: Wrong agency ID or no active vehicles
**Solution**: 
1. Verify agency ID is correct (example: agency-id)
2. Check during business hours
3. Try different time of day

### Stale Data
**Problem**: Data doesn't update despite refresh
**Solution**: Clear cache and hard refresh (Ctrl+Shift+R)

## Debug Tools

### API Validation
Visit `/debug.html` when dev server is running to test:
- API key validity
- Network connectivity
- Data retrieval
- Authentication status

### Postman Collection Testing
**Problem**: Need to validate API integration after code changes
**Solution**: Run automated Postman collection tests
1. Set `POSTMAN_API_KEY` environment variable
2. Enable Postman power in MCP config
3. Collection automatically tests all endpoints with proper timeouts

### Browser Console
Check for error messages:
```javascript
// Check API key
localStorage.getItem('config')

// Test API call
fetch('/api/tranzy/v1/opendata/agency', {
  headers: { 'X-API-Key': 'your-key-here' }
})
```

## Quick Fixes

### Refresh Authentication
1. Go to Settings
2. Re-enter API key
3. Save configuration
4. Refresh page

### Clear Auth Data
```javascript
// Clear authentication (browser console)
localStorage.removeItem('config');
location.reload();
```

### Test Connection
1. Open `/debug.html`
2. Check all API endpoints
3. Verify authentication works
4. Test data retrieval