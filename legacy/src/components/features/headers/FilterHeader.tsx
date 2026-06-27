// FilterHeader - Consistent, lightweight filter header for all views
// Provides unified styling and layout for filter controls across the app

import type { FC, ReactNode } from 'react';
import { 
  Box, 
  Typography, 
  Stack,
  Divider
} from '@mui/material';

interface FilterHeaderProps {
  /** Optional count display (e.g., "157 routes found") */
  count?: {
    value: number;
    label: string; // "routes", "stations", etc.
  };
  /** Filter controls (chips, buttons, etc.) */
  children: ReactNode;
  /** Whether to show a divider below the header */
  showDivider?: boolean;
}

export const FilterHeader: FC<FilterHeaderProps> = ({
  count,
  children,
  showDivider = true
}) => {
  return (
    <>
      <Box sx={{ 
        px: 2, 
        py: 1.5,
        bgcolor: 'background.paper'
      }}>
        {/* Mobile-first responsive layout */}
        <Stack spacing={1.5}>
          {/* Count display - always on top on mobile */}
          {count && (
            <Typography 
              variant="body2" 
              color="text.secondary"
              sx={{ 
                fontSize: '0.875rem',
                fontWeight: 500
              }}
            >
              {count.value} {count.label}{count.value !== 1 ? 's' : ''}
            </Typography>
          )}
          
          {/* Filter controls - full width on mobile, wrapping allowed */}
          <Box
            sx={{ 
              display: 'flex',
              flexWrap: 'wrap',
              gap: 1,
              alignItems: 'center'
            }}
          >
            {children}
          </Box>
        </Stack>
      </Box>
      
      {showDivider && <Divider />}
    </>
  );
};