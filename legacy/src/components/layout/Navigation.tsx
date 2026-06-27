// Navigation - Bottom navigation component (< 40 lines)
// Uses Material-UI directly without wrappers

import type { FC } from 'react';
import { BottomNavigation, BottomNavigationAction, Paper } from '@mui/material';
import { 
  Favorite as FavoriteIcon, 
  Settings as SettingsIcon,
  LocationOn as LocationIcon 
} from '@mui/icons-material';

interface NavigationProps {
  value: number;
  onChange: (value: number) => void;
}

export const Navigation: FC<NavigationProps> = ({ value, onChange }) => {
  return (
    <Paper sx={{ position: 'fixed', bottom: 0, left: 0, right: 0 }} elevation={3}>
      <BottomNavigation
        value={value}
        onChange={(event, newValue) => onChange(newValue)}
        showLabels
      >
        <BottomNavigationAction
          label="Stations"
          icon={<LocationIcon />}
        />
        <BottomNavigationAction
          label="Favorites"
          icon={<FavoriteIcon />}
        />
      </BottomNavigation>
    </Paper>
  );
};