// RouteBadge - Enhanced route badge component with station role indicators
// Displays route number with optional Start (Play) and End (Stop) icons
// Reusable across StationList, maps, and other contexts

import type { FC } from 'react';
import { Avatar, Box } from '@mui/material';
import { PlayArrow as PlayArrowIcon, Stop as StopIcon } from '@mui/icons-material';

export interface RouteBadgeProps {
  routeNumber: string;
  routeColor?: string;
  isStart?: boolean;
  isEnd?: boolean;
  size?: 'small' | 'medium' | 'large';
  onClick?: () => void;
  selected?: boolean;
  isFavorite?: boolean;
}

export const RouteBadge: FC<RouteBadgeProps> = ({
  routeNumber,
  routeColor,
  isStart = false,
  isEnd = false,
  size = 'medium',
  onClick,
  selected = false,
  isFavorite = false
}) => {
  // Size mapping for Avatar
  const sizeMap = {
    small: { width: 28, height: 28, fontSize: '0.7rem' },
    medium: { width: 32, height: 32, fontSize: '0.75rem' },
    large: { width: 40, height: 40, fontSize: '0.9rem' }
  };

  // Size mapping for icons
  const iconSizeMap = {
    small: 12,
    medium: 14,
    large: 16
  };

  const avatarSize = sizeMap[size];
  const iconSize = iconSizeMap[size];

  // Determine background color based on selection and favorite status
  let backgroundColor;
  if (selected) {
    backgroundColor = 'primary.main';
  } else if (isFavorite) {
    // Faint grey+red for unselected favorite routes
    backgroundColor = 'grey.A200';
  } else {
    backgroundColor = routeColor ? `#${routeColor}` : 'grey.400';
  }

  return (
    <Avatar
      onClick={onClick}
      sx={{
        width: avatarSize.width,
        height: avatarSize.height,
        fontSize: avatarSize.fontSize,
        fontWeight: 'bold',
        bgcolor: backgroundColor,
        color: selected ? 'white' : (isFavorite ? 'error.dark' : 'white'),
        minWidth: avatarSize.width,
        flexShrink: 0,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.2s ease-in-out',
        position: 'relative',
        overflow: 'visible',
        '&:hover': onClick ? {
          transform: 'scale(1.1)',
          boxShadow: 2
        } : {},
        border: selected 
          ? '2px solid' 
          : (isFavorite ? '1px solid' : '1px solid transparent'),
        borderColor: selected 
          ? 'primary.dark' 
          : (isFavorite ? 'grey.A200' : 'transparent'),
        boxShadow: selected ? 2 : 0
      }}
    >
      {routeNumber}
      
      {/* Start indicator (Play icon) at 1:00 position */}
      {isStart && (
        <Box
          sx={{
            position: 'absolute',
            top: '10%',
            right: '10%',
            transform: 'translate(50%, -50%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'success.main',
            borderRadius: '50%',
            width: iconSize,
            height: iconSize,
            border: '1px solid white',
            boxShadow: 1
          }}
        >
          <PlayArrowIcon 
            sx={{ 
              fontSize: iconSize * 0.7,
              color: 'white'
            }} 
          />
        </Box>
      )}
      
      {/* End indicator (Stop icon) at 7:00 position */}
      {isEnd && (
        <Box
          sx={{
            position: 'absolute',
            bottom: '10%',
            left: '10%',
            transform: 'translate(-50%, 50%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'error.main',
            borderRadius: '50%',
            width: iconSize,
            height: iconSize,
            border: '1px solid white',
            boxShadow: 1
          }}
        >
          <StopIcon 
            sx={{ 
              fontSize: iconSize * 0.7,
              color: 'white'
            }} 
          />
        </Box>
      )}
    </Avatar>
  );
};
