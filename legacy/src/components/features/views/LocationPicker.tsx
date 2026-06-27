// LocationPicker - Basic location selection component (< 100 lines)
// Simple location input without fancy UI

import { useState } from 'react';
import type { FC } from 'react';
import { Box, TextField, Button, Typography, Alert, CircularProgress } from '@mui/material';
import { handleLocationError } from '../../../services/error';

interface LocationPickerProps {
  label: string;
  value: { lat: number; lon: number } | null;
  onChange: (location: { lat: number; lon: number }) => void;
}

export const LocationPicker: FC<LocationPickerProps> = ({ 
  label, 
  value, 
  onChange 
}) => {
  const [lat, setLat] = useState(value?.lat?.toString() || '');
  const [lon, setLon] = useState(value?.lon?.toString() || '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const validateAndSave = () => {
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);
    
    if (isNaN(latNum) || isNaN(lonNum)) {
      setError('Please enter valid coordinates');
      return;
    }
    
    if (latNum < -90 || latNum > 90 || lonNum < -180 || lonNum > 180) {
      setError('Invalid coordinates range (lat: -90 to 90, lon: -180 to 180)');
      return;
    }
    
    setError(null);
    onChange({ lat: latNum, lon: lonNum });
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      const error = handleLocationError(new Error('Geolocation not supported'), 'get current location');
      setError(error.message);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const newLat = position.coords.latitude;
        const newLon = position.coords.longitude;
        setLat(newLat.toString());
        setLon(newLon.toString());
        onChange({ lat: newLat, lon: newLon });
        setLoading(false);
      },
      (geoError) => {
        setLoading(false);
        const locationError = handleLocationError(geoError, 'get current location');
        setError(locationError.message);
      },
      {
        timeout: 10000,
        enableHighAccuracy: true
      }
    );
  };

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>{label}</Typography>
      
      {error && (
        <Alert 
          severity="error" 
          sx={{ mb: 2 }}
          action={
            <Button 
              color="inherit" 
              size="small" 
              onClick={() => setError(null)}
            >
              Dismiss
            </Button>
          }
        >
          {error}
        </Alert>
      )}
      
      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <TextField
          label="Latitude"
          value={lat}
          onChange={(e) => setLat(e.target.value)}
          type="number"
          inputProps={{ step: 'any' }}
          error={lat !== '' && (isNaN(parseFloat(lat)) || parseFloat(lat) < -90 || parseFloat(lat) > 90)}
          helperText={
            lat !== '' && (isNaN(parseFloat(lat)) || parseFloat(lat) < -90 || parseFloat(lat) > 90)
              ? 'Must be between -90 and 90'
              : ''
          }
        />
        <TextField
          label="Longitude"
          value={lon}
          onChange={(e) => setLon(e.target.value)}
          type="number"
          inputProps={{ step: 'any' }}
          error={lon !== '' && (isNaN(parseFloat(lon)) || parseFloat(lon) < -180 || parseFloat(lon) > 180)}
          helperText={
            lon !== '' && (isNaN(parseFloat(lon)) || parseFloat(lon) < -180 || parseFloat(lon) > 180)
              ? 'Must be between -180 and 180'
              : ''
          }
        />
      </Box>
      
      <Box sx={{ display: 'flex', gap: 2 }}>
        <Button 
          variant="contained" 
          onClick={validateAndSave}
          disabled={
            !lat || !lon || 
            isNaN(parseFloat(lat)) || isNaN(parseFloat(lon)) ||
            parseFloat(lat) < -90 || parseFloat(lat) > 90 ||
            parseFloat(lon) < -180 || parseFloat(lon) > 180
          }
        >
          Save Location
        </Button>
        <Button 
          variant="outlined" 
          onClick={useCurrentLocation}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={16} /> : undefined}
        >
          {loading ? 'Getting Location...' : 'Use Current Location'}
        </Button>
      </Box>
    </Box>
  );
};