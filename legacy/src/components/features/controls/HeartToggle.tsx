import type { FC } from 'react';
import { IconButton } from '@mui/material';
import { Favorite, FavoriteBorder } from '@mui/icons-material';

interface HeartToggleProps {
  routeId: string;
  isFavorite: boolean;
  onToggle: (routeId: string) => void;
  size?: 'small' | 'medium';
}

export const HeartToggle: FC<HeartToggleProps> = ({
  routeId,
  isFavorite,
  onToggle,
  size = 'medium'
}) => {
  const handleClick = () => {
    onToggle(routeId);
  };

  return (
    <IconButton
      onClick={handleClick}
      size={size}
      aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      sx={{
        transition: 'all 0.3s ease-in-out',
        '& .MuiSvgIcon-root': {
          transition: 'all 0.3s ease-in-out'
        }
      }}
    >
      {isFavorite ? (
        <Favorite color="error" />
      ) : (
        <FavoriteBorder />
      )}
    </IconButton>
  );
};