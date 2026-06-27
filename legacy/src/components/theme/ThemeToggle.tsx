// ThemeToggle - Simple theme toggle button component
// Minimal implementation for light/dark mode switching

import type { FC } from 'react';
import { 
  IconButton, 
  Tooltip 
} from '@mui/material';
import { 
  LightMode as LightModeIcon,
  DarkMode as DarkModeIcon 
} from '@mui/icons-material';
import { useConfigStore } from '../../stores/configStore';

interface ThemeToggleProps {
  size?: 'small' | 'medium' | 'large';
}

export const ThemeToggle: FC<ThemeToggleProps> = ({ size = 'medium' }) => {
  const { theme, toggleTheme } = useConfigStore();
  
  const isDark = theme === 'dark';
  
  return (
    <Tooltip title={`Switch to ${isDark ? 'light' : 'dark'} mode`}>
      <IconButton
        onClick={toggleTheme}
        size={size}
        sx={{
          transition: 'all 0.3s ease-in-out',
          '&:hover': {
            transform: 'rotate(180deg)',
          },
        }}
      >
        {isDark ? <LightModeIcon /> : <DarkModeIcon />}
      </IconButton>
    </Tooltip>
  );
};