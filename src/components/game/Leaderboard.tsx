'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Crown, Flame, Wifi, WifiOff, Check } from 'lucide-react';
import { usePlayers } from '@/store/gameStore';
import { GameAvatar } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface LeaderboardProps {
  compact?: boolean;
  showAnswerStatus?: boolean;
}

export function Leaderboard({ compact = false, showAnswerStatus = false }: LeaderboardProps) {
  const players = usePlayers();
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

  if (compact) {
    return (
      <div className="flex flex-wrap gap-2 justify-center">
        <AnimatePresence mode="popLayout">
          {sortedPlayers.map((player, index) => (
            <motion.div
              key={player.id}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-full glass text-sm',
                index === 0 && 'border-yellow-500/50 bg-yellow-500/10',
                !player.isConnected && 'opacity-50'
              )}
            >
              {index === 0 && <Crown className="w-3.5 h-3.5 text-yellow-500" />}
              <GameAvatar 
                seed={player.avatarSeed} 
                mood={player.hasAnswered ? 'hopeful' : 'neutral'} 
                size="xs" 
              />
              <span className="font-medium truncate max-w-[80px]">{player.name}</span>
              <span className="font-mono text-primary font-bold">{player.score}</span>
              {showAnswerStatus && player.hasAnswered && (
                <Check className="w-3.5 h-3.5 text-green-500" />
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl p-4 space-y-2">
      <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">
        Rangliste
      </h3>
      <AnimatePresence mode="popLayout">
        {sortedPlayers.map((player, index) => (
          <motion.div
            key={player.id}
            layout
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className={cn(
              'flex items-center gap-3 p-3 rounded-xl transition-all',
              index === 0 && 'bg-gradient-to-r from-yellow-500/20 to-transparent border border-yellow-500/30',
              index === 1 && 'bg-gradient-to-r from-gray-400/20 to-transparent',
              index === 2 && 'bg-gradient-to-r from-amber-700/20 to-transparent',
              !player.isConnected && 'opacity-50'
            )}
          >
            {/* Rank */}
            <div
              className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm',
                index === 0 && 'bg-yellow-500 text-black',
                index === 1 && 'bg-gray-400 text-black',
                index === 2 && 'bg-amber-700 text-white',
                index > 2 && 'bg-muted text-muted-foreground'
              )}
            >
              {index === 0 ? <Crown className="w-4 h-4" /> : index + 1}
            </div>

            {/* Avatar */}
            <div className="relative">
              <GameAvatar 
                seed={player.avatarSeed} 
                mood={player.streak > 2 ? 'happy' : 'neutral'} 
                size="md" 
              />
              {showAnswerStatus && player.hasAnswered && (
                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
            </div>

            {/* Name & Status */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold truncate">{player.name}</span>
                {player.isHost && (
                  <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded">Host</span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {player.streak > 0 && (
                  <span className="flex items-center gap-1 text-orange-500">
                    <Flame className="w-3 h-3" />
                    {player.streak}
                  </span>
                )}
                {player.isConnected ? (
                  <Wifi className="w-3 h-3 text-green-500" />
                ) : (
                  <WifiOff className="w-3 h-3 text-red-500" />
                )}
              </div>
            </div>

            {/* Score */}
            <div className="text-right">
              <motion.span
                key={player.score}
                initial={{ scale: 1.3, color: '#22c55e' }}
                animate={{ scale: 1, color: 'var(--primary)' }}
                className="font-mono font-black text-lg text-primary"
              >
                {player.score.toLocaleString()}
              </motion.span>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

