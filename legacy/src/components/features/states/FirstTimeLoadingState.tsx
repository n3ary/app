// FirstTimeLoadingState - Loading state for first-time users with empty cache
// Requirement 7.6: Display loading states when cache is empty on first load

import type { FC } from 'react';
import { 
  Box, 
  CircularProgress, 
  Typography, 
  Stack 
} from '@mui/material';

interface FirstTimeLoadingStateProps {
  message?: string;
  subMessage?: string;
}

export const FirstTimeLoadingState: FC<FirstTimeLoadingStateProps> = ({
  message = "Loading transit data...",
  subMessage = "This may take a moment on first load"
}) => {
  return (
    <Box 
      display="flex" 
      justifyContent="center" 
      alignItems="center" 
      minHeight="200px"
      p={3}
    >
      <Stack spacing={2} alignItems="center">
        <CircularProgress size={40} />
        <Typography 
          variant="body1" 
          color="text.primary"
          textAlign="center"
        >
          {message}
        </Typography>
        <Typography 
          variant="body2" 
          color="text.secondary"
          textAlign="center"
        >
          {subMessage}
        </Typography>
      </Stack>
    </Box>
  );
};