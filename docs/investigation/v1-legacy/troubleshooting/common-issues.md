# Common Issues

## Map and Debug Issues

### Debug Layer Crashes Map
**Problem**: Clicking debug layer toggle causes Leaflet errors "Cannot set properties of undefined" and "Cannot read properties of undefined (reading 'appendChild')"
**Solution**: Map container initialization issue - refresh page and avoid rapid debug toggle clicks

## Setup Problems

### API Key Not Working
**Problem**: Invalid API key error during setup
**Solution**: 
1. Double-check API key for typos
2. Ensure no extra spaces
3. Get new API key from Tranzy
4. Test with debug tool

### Location Not Detected
**Problem**: "Location Required" message
**Solution**: 
1. Enable browser location permissions
2. Use HTTPS connection
3. Set fallback location in Settings
4. Try different browser

### Setup Wizard Stuck
**Problem**: Can't complete initial setup
**Solution**: 
1. Clear browser data
2. Restart browser
3. Try incognito mode
4. Use different browser

## Data Problems

### No Vehicles Showing
**Problem**: "No vehicles currently serving nearby stations"
**Solution**: 
1. Check during business hours
2. Verify location is correct
3. Try different location
4. Check API key is valid

### "Unable to Load Data" or "No stations have active route associations"
**Problem**: Nearby view shows error about no active route associations
**Solution**: 
1. This is usually a temporary data loading issue
2. Wait a few seconds for all data to load
3. Refresh the page if issue persists
4. The app automatically falls back to showing all routes when detailed schedule data is unavailable

### Outdated Information
**Problem**: Bus times seem wrong or old
**Solution**: 
1. Refresh page (pull down or F5)
2. Clear cache
3. Check internet connection
4. Wait for auto-refresh

### Missing Routes
**Problem**: Expected bus routes not appearing
**Solution**: 
1. Check route is active today
2. Verify location is near route
3. Try different time of day
4. Check favorites configuration

## UI Problems

### Page Not Loading
**Problem**: Blank screen or loading forever
**Solution**: 
1. Hard refresh (Ctrl+Shift+R)
2. Clear browser cache
3. Disable browser extensions
4. Try incognito mode

### Buttons Not Working
**Problem**: Clicks not responding
**Solution**: 
1. Wait for page to fully load
2. Clear browser cache
3. Disable ad blockers
4. Try different browser

### Layout Broken
**Problem**: Elements overlapping or misaligned
**Solution**: 
1. Refresh page
2. Clear cache
3. Check browser zoom level
4. Try different screen size

## Performance Issues

### Slow Performance
**Problem**: App responds slowly
**Solution**: 
1. Close other browser tabs
2. Clear cache and cookies
3. Restart browser
4. Check internet speed

### High Memory Usage
**Problem**: Browser becomes sluggish
**Solution**: 
1. Refresh page regularly
2. Close unused tabs
3. Clear browser data
4. Restart browser

## Quick Diagnostic Steps

### First Try
1. Refresh page (F5)
2. Check internet connection
3. Wait 30 seconds for loading

### If Still Broken
1. Hard refresh (Ctrl+Shift+R)
2. Clear browser cache
3. Try incognito mode

### Last Resort
1. Clear all browser data for site
2. Restart browser
3. Re-setup from scratch