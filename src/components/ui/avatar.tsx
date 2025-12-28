'use client';

import { cn } from '@/lib/utils';

export type AvatarMood = 'angry' | 'confused' | 'happy' | 'hopeful' | 'neutral' | 'sad' | 'superHappy';

interface GameAvatarProps {
  seed: string;
  mood?: AvatarMood;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
  alt?: string;
}

const sizeClasses = {
  xs: 'w-5 h-5',
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-12 h-12',
  xl: 'w-14 h-14',
  '2xl': 'w-20 h-20',
};

/**
 * Game Avatar Component using DiceBear Dylan style
 * @see https://www.dicebear.com/styles/dylan/
 */
export function GameAvatar({ 
  seed, 
  mood = 'neutral', 
  size = 'md',
  className,
  alt = '',
}: GameAvatarProps) {
  const url = `https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(seed)}&mood=${mood}`;
  
  return (
    <img
      src={url}
      alt={alt}
      className={cn(
        'rounded-full bg-muted',
        sizeClasses[size],
        className
      )}
    />
  );
}

/**
 * Get appropriate mood based on game context
 */
export function getMoodForContext(context: {
  isCorrect?: boolean;
  isWinner?: boolean;
  isLoser?: boolean;
  isWaiting?: boolean;
  isThinking?: boolean;
  points?: number;
}): AvatarMood {
  const { isCorrect, isWinner, isLoser, isWaiting, isThinking, points } = context;
  
  if (isWinner) return 'superHappy';
  if (isCorrect === true) return points && points > 1200 ? 'superHappy' : 'happy';
  if (isCorrect === false) return 'sad';
  if (isLoser) return 'sad';
  if (isThinking) return 'confused';
  if (isWaiting) return 'hopeful';
  
  return 'neutral';
}
