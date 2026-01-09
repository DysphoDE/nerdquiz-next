'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Crown, Flame, Wifi, WifiOff, Check, X } from 'lucide-react';
import { usePlayers } from '@/store/gameStore';
import { GameAvatar, type AvatarMood } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { Player } from '@/types/game';

interface LeaderboardProps {
  compact?: boolean;
  showAnswerStatus?: boolean;
  
  // Customization
  customBadge?: (player: Player) => React.ReactNode;
  customStatus?: (player: Player) => { text?: string; color?: string; score?: number };
  customAvatar?: (player: Player) => React.ReactNode; // If provided, replaces default avatar
  
  // State Overrides
  highlightPlayerId?: string | null;
  frozenScores?: Map<string, number>; // If provided, shows these scores instead of player.score
  eliminatedPlayerIds?: string[];
  
  // Animation
  pointsGained?: Map<string, number>; // Shows +X animation next to score
}

export function Leaderboard({ 
  compact = false, 
  showAnswerStatus = false,
  customBadge,
  customStatus,
  customAvatar,
  highlightPlayerId,
  frozenScores,
  eliminatedPlayerIds = [],
  pointsGained,
}: LeaderboardProps) {
  const players = usePlayers();
  
  // Calculate display scores (either frozen or current)
  const playersWithScores = players.map(p => ({
    ...p,
    displayScore: frozenScores?.get(p.id) ?? p.score
  }));

  // Sort by display score
  const sortedPlayers = [...playersWithScores].sort((a, b) => b.displayScore - a.displayScore);

  if (compact) {
    return (
      <div className="flex flex-wrap gap-2 justify-center">
        <AnimatePresence mode="popLayout">
          {sortedPlayers.map((player, index) => {
            const isHighlighted = highlightPlayerId === player.id;
            const isEliminated = eliminatedPlayerIds.includes(player.id);
            const points = pointsGained?.get(player.id);
            
            return (
              <motion.div
                key={player.id}
                layout
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-full glass text-sm',
                  index === 0 && 'border-yellow-500/50 bg-yellow-500/10',
                  isHighlighted && 'border-amber-500 bg-amber-500/20',
                  isEliminated && 'opacity-50 grayscale',
                  !player.isConnected && 'opacity-30'
                )}
              >
                {index === 0 && <Crown className="w-3.5 h-3.5 text-yellow-500" />}
                
                {/* Avatar */}
                <div className="relative w-6 h-6">
                  {customAvatar ? customAvatar(player) : (
                    <GameAvatar 
                      seed={player.avatarSeed} 
                      mood={isEliminated ? 'sad' : !player.isConnected ? 'confused' : player.hasAnswered ? 'hopeful' : 'neutral'} 
                      size="xs" 
                      className={!player.isConnected ? 'grayscale' : ''}
                    />
                  )}
                  {isEliminated ? (
                    <div className="absolute -top-1 -right-1 bg-background rounded-full">
                      <X className="w-3 h-3 text-red-500" />
                    </div>
                  ) : !player.isConnected && (
                    <div className="absolute -top-1 -right-1 bg-background rounded-full">
                      <WifiOff className="w-3 h-3 text-red-500" />
                    </div>
                  )}
                </div>

                <span className={cn(
                  "font-medium truncate max-w-[80px]",
                  isEliminated && "line-through text-muted-foreground",
                  !player.isConnected && "text-muted-foreground italic"
                )}>
                  {player.name}
                </span>
                
                <div className="flex flex-col leading-none">
                  <motion.span 
                    key={player.displayScore}
                    initial={points ? { scale: 1.2, color: '#22c55e' } : false}
                    animate={{ scale: 1, color: 'var(--primary)' }}
                    className="font-mono text-primary font-bold"
                  >
                    {player.displayScore}
                  </motion.span>
                </div>

                {/* Points gained badge (compact) */}
                {points !== undefined && points > 0 && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.5, y: 5 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    className="text-[10px] font-mono font-bold text-green-500"
                  >
                    +{points}
                  </motion.span>
                )}

                {showAnswerStatus && player.hasAnswered && !isEliminated && (
                  <Check className="w-3.5 h-3.5 text-green-500" />
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    );
  }

  // Desktop View
  return (
    <div className="glass rounded-2xl p-4 space-y-2">
      <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">
        Rangliste
      </h3>
      <AnimatePresence mode="popLayout">
        {sortedPlayers.map((player, index) => {
          const status = customStatus?.(player);
          const isHighlighted = highlightPlayerId === player.id;
          const isEliminated = eliminatedPlayerIds.includes(player.id);
          const points = pointsGained?.get(player.id);
          
          return (
            <motion.div
              key={player.id}
              layout
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className={cn(
                'flex items-center gap-3 p-3 rounded-xl transition-all',
                isHighlighted 
                  ? 'bg-amber-500/20 border border-amber-500/50 ring-2 ring-amber-500/30'
                  : index === 0 
                    ? 'bg-gradient-to-r from-yellow-500/20 to-transparent border border-yellow-500/30'
                    : index === 1 
                      ? 'bg-gradient-to-r from-gray-400/20 to-transparent'
                      : index === 2 
                        ? 'bg-gradient-to-r from-amber-700/20 to-transparent'
                        : 'bg-muted/30',
                isEliminated && 'opacity-60 grayscale bg-muted/10',
                !player.isConnected && 'opacity-40'
              )}
            >
              {/* Rank */}
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0',
                  index === 0 && 'bg-yellow-500 text-black',
                  index === 1 && 'bg-gray-400 text-black',
                  index === 2 && 'bg-amber-700 text-white',
                  index > 2 && 'bg-muted text-muted-foreground'
                )}
              >
                {index === 0 ? <Crown className="w-4 h-4" /> : index + 1}
              </div>

              {/* Avatar */}
              <div className="relative w-10 h-10 shrink-0">
                {customAvatar ? customAvatar(player) : (
                  <>
                    <GameAvatar 
                      seed={player.avatarSeed} 
                      mood={isEliminated ? 'sad' : !player.isConnected ? 'confused' : player.streak > 2 ? 'happy' : 'neutral'} 
                      size="md" 
                      className={!player.isConnected ? 'grayscale' : ''}
                    />
                    {isEliminated ? (
                      <div className="absolute inset-0 bg-background/50 rounded-full flex items-center justify-center">
                        <X className="w-6 h-6 text-red-500" />
                      </div>
                    ) : !player.isConnected && (
                      <div className="absolute -top-1 -right-1 bg-background rounded-full p-0.5 border border-border">
                        <WifiOff className="w-4 h-4 text-red-500" />
                      </div>
                    )}
                  </>
                )}
                
                {showAnswerStatus && player.hasAnswered && !isEliminated && player.isConnected && (
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center"
                  >
                    <Check className="w-3 h-3 text-white" />
                  </motion.div>
                )}
                {customBadge?.(player)}
              </div>

              {/* Name & Status */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "font-bold truncate",
                    isEliminated && "line-through text-muted-foreground",
                    !player.isConnected && "text-muted-foreground italic"
                  )}>
                    {player.name}
                  </span>
                  {player.isHost && (
                    <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded shrink-0">Host</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {!player.isConnected ? (
                    <span className="text-red-500 font-medium flex items-center gap-1">
                      <WifiOff className="w-3 h-3" /> Offline
                    </span>
                  ) : status?.text ? (
                    <span className={cn('font-medium', status.color)}>{status.text}</span>
                  ) : isEliminated ? (
                    <span className="text-red-500 font-medium">Ausgeschieden</span>
                  ) : player.streak > 0 ? (
                    <span className="flex items-center gap-1 text-orange-500">
                      <Flame className="w-3 h-3" />
                      {player.streak}
                    </span>
                  ) : null}
                </div>
              </div>

              {/* Score */}
              <div className="text-right shrink-0">
                <motion.span
                  key={player.displayScore}
                  initial={points ? { scale: 1.3, color: '#22c55e' } : false}
                  animate={{ scale: 1, color: 'var(--primary)' }}
                  className="font-mono font-black text-lg text-primary block"
                >
                  {player.displayScore.toLocaleString()}
                </motion.span>
                
                {/* Points gained animation */}
                <AnimatePresence>
                  {(points !== undefined && points > 0) || (status?.score !== undefined && status.score > 0) ? (
                    <motion.p
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="text-xs font-medium font-mono text-green-500"
                    >
                      +{points || status?.score}
                    </motion.p>
                  ) : null}
                </AnimatePresence>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
