// ThemeProvider - Material-UI theme integration component (< 20 lines)
// Connects ConfigStore theme preference with Material-UI

import type { FC, ReactNode } from 'react';
import { ThemeProvider as MuiThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { useConfigStore } from '../../stores/configStore';

// Extend Material-UI Paper component to support custom variants (Card extends Paper)
declare module '@mui/material/Paper' {
  interface PaperPropsVariantOverrides {
    vehicle: true;
  }
}

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: FC<ThemeProviderProps> = ({ children }) => {
  const { theme: themeMode } = useConfigStore();
  
  const theme = createTheme({
    palette: {
      mode: themeMode === 'auto' ? 'light' : themeMode || 'light',
      primary: {
        main: '#1976d2',
      },
      // Custom colors for favorite routes
      grey: {
        50: '#fafafa',
        100: '#f5f5f5',
        200: '#eeeeee',
        300: '#e0e0e0',
        400: '#bdbdbd',
        500: '#9e9e9e',
        600: '#757575',
        700: '#616161',
        800: '#424242',
        900: '#212121',
        // Custom favorite route colors
        A100: '#f5f0f0', // Faint grey+red background for unselected favorites
        A200: '#e0b4b4', // Subtle red border for favorites  
        A400: '#8b4444', // Darker red text for favorites
      },
    },
    components: {
      // Custom component variants for different card types
      MuiPaper: {
        variants: [
          {
            props: { variant: 'vehicle' },
            style: ({ theme }) => ({
              backgroundColor: theme.palette.mode === 'dark' 
                ? 'rgba(255, 255, 255, 0.08)' // Slightly more visible in dark mode
                : 'rgba(255, 255, 255, 0.8)',  // Lighter in light mode
            }),
          },
        ],
      },
    },
  });

  return (
    <MuiThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </MuiThemeProvider>
  );
};