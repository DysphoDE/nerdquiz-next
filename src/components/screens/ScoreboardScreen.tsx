'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { 
  Crown, 
  Trophy, 
  Flame, 
  ArrowRight, 
  TrendingUp, 
  TrendingDown,
  Minus,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useSocket } from '@/hooks/useSocket';
import { useGameStore, useIsHost, usePlayers } from '@/store/gameStore';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useEffect, useMemo, useRef } from 'react';
import { getAvatarUrlFromSeed } from '@/components/game/AvatarCustomizer';
import { useAudio } from '@/hooks/useAudio';

// Rank colors and styling
const RANK_CONFIG = [
  { 
    gradient: 'from-yellow-400 via-amber-400 to-yellow-500',
    bg: 'bg-gradient-to-br from-yellow-500/20 to-amber-500/10',
    ring: 'ring-yellow-500/50',
    text: 'text-yellow-500',
    badge: 'bg-yellow-500',
  },
  { 
    gradient: 'from-slate-300 via-gray-300 to-slate-400',
    bg: 'bg-gradient-to-br from-slate-400/20 to-gray-400/10',
    ring: 'ring-slate-400/50',
    text: 'text-slate-400',
    badge: 'bg-slate-400',
  },
  { 
    gradient: 'from-amber-600 via-orange-600 to-amber-700',
    bg: 'bg-gradient-to-br from-amber-700/20 to-orange-700/10',
    ring: 'ring-amber-700/50',
    text: 'text-amber-600',
    badge: 'bg-amber-700',
  },
];

interface PlayerWithRankChange {
  id: string;
  name: string;
  avatarSeed: string;
  score: number;
  previousScore?: number;
  streak: number;
  isHost: boolean;
  isConnected: boolean;
  currentRank: number;
  previousRank?: number;
  rankChange: 'up' | 'down' | 'same';
  scoreGained: number;
}

export function ScoreboardScreen() {
  const { next } = useSocket();
  const { room } = useGameStore();
  const isHost = useIsHost();
  const unsortedPlayers = usePlayers();
  const { playMusic } = useAudio();

  // Play scoreboard music when entering
  useEffect(() => {
    playMusic('scoreboard');
  }, [playMusic]);
  
  // Track previous scores & ranks to calculate real rank changes
  const previousSnapshotRef = useRef<Map<string, { score: number; rank: number }> | null>(null);
  
  // Sort and calculate rank changes
  const players: PlayerWithRankChange[] = useMemo(() => {
    const sorted = [...unsortedPlayers].sort((a, b) => b.score - a.score);
    const previousSnapshot = previousSnapshotRef.current;
    
    const result = sorted.map((player, index) => {
      const currentRank = index + 1;
      const prev = previousSnapshot?.get(player.id);
      const previousScore = prev?.score ?? player.score;
      const previousRank = prev?.rank ?? currentRank;
      const scoreGained = player.score - previousScore;
      
      let rankChange: 'up' | 'down' | 'same' = 'same';
      if (previousSnapshot) {
        if (currentRank < previousRank) rankChange = 'up';
        else if (currentRank > previousRank) rankChange = 'down';
      }
      
      return {
        ...player,
        previousScore,
        currentRank,
        previousRank,
        rankChange,
        scoreGained,
      };
    });
    
    // Save current snapshot for next scoreboard visit
    const newSnapshot = new Map<string, { score: number; rank: number }>();
    result.forEach(p => newSnapshot.set(p.id, { score: p.score, rank: p.currentRank }));
    previousSnapshotRef.current = newSnapshot;
    
    return result;
  }, [unsortedPlayers]);

  const handleNext = () => {
    if (!room || !isHost) return;
    next();
  };

  const isFinalRound = room && room.currentRound >= room.settings.maxRounds;
  const leader = players[0];

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen p-3 sm:p-6 flex flex-col relative overflow-hidden"
    >
      {/* Subtle background glow */}
      <div className="absolute inset-0 bg-gradient-glow opacity-30 pointer-events-none" />
      
      <div className="max-w-2xl mx-auto w-full flex-1 flex flex-col relative z-10">
        
        {/* Compact Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-4 sm:py-6"
        >
          <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full glass text-sm sm:text-base">
            <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            <span className="font-bold">
              Runde {room?.currentRound}
              <span className="text-muted-foreground font-normal"> / {room?.settings.maxRounds}</span>
            </span>
          </div>
        </motion.div>

        {/* Leader Spotlight */}
        {leader && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="mb-6 sm:mb-8"
          >
            <div className="relative glass rounded-2xl p-4 sm:p-6 border border-yellow-500/30 overflow-hidden">
              {/* Background sparkle effect */}
              <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/5 via-transparent to-amber-500/5" />
              
              <div className="relative flex items-center gap-4">
                {/* Leader Avatar */}
                <div className="relative">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                    className="absolute -inset-2 rounded-full bg-gradient-to-r from-yellow-500/30 via-amber-500/30 to-yellow-500/30 blur-sm"
                  />
                  <img
                    src={getAvatarUrlFromSeed(leader.avatarSeed, 'superHappy')}
                    alt=""
                    className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-muted ring-2 ring-yellow-500"
                  />
                  <motion.div
                    initial={{ y: -10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="absolute -top-3 -right-1"
                  >
                    <Crown className="w-6 h-6 sm:w-7 sm:h-7 text-yellow-500 drop-shadow-lg" />
                  </motion.div>
                </div>

                {/* Leader Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm text-yellow-500 font-medium mb-0.5">In Führung</p>
                  <p className="font-bold text-lg sm:text-xl truncate">{leader.name}</p>
                  {leader.streak > 0 && (
                    <div className="flex items-center gap-1 text-orange-500 text-sm mt-1">
                      <Flame className="w-4 h-4" />
                      <span className="font-bold">{leader.streak}er Streak</span>
                    </div>
                  )}
                </div>

                {/* Leader Score */}
                <div className="text-right">
                  <motion.p
                    key={leader.score}
                    initial={{ scale: 1.2 }}
                    animate={{ scale: 1 }}
                    className="font-mono font-black text-2xl sm:text-4xl bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent"
                  >
                    {leader.score.toLocaleString()}
                  </motion.p>
                  <p className="text-xs text-muted-foreground">Punkte</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Compact Rankings */}
        <div className="flex-1 space-y-2">
          <AnimatePresence>
            {players.slice(1).map((player, index) => {
              const actualRank = index + 2; // Since we skip the leader
              const rankConfig = RANK_CONFIG[actualRank - 1];
              
              return (
                <motion.div
                  key={player.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + index * 0.05 }}
                  className={cn(
                    'glass rounded-xl p-3 sm:p-4 flex items-center gap-3 transition-all',
                    rankConfig?.bg,
                    player.isConnected ? '' : 'opacity-60'
                  )}
                >
                  {/* Rank Badge */}
                  <div
                    className={cn(
                      'w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center font-black text-sm sm:text-base shrink-0',
                      rankConfig ? `${rankConfig.badge} text-black` : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {actualRank}
                  </div>

                  {/* Avatar with mood based on rank */}
                  <img
                    src={getAvatarUrlFromSeed(player.avatarSeed, actualRank === 2 ? 'happy' : actualRank === 3 ? 'hopeful' : 'neutral')}
                    alt=""
                    className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-muted shrink-0"
                  />

                  {/* Name & Streak */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-sm sm:text-base truncate">{player.name}</p>
                      {player.isHost && (
                        <span className="text-[10px] sm:text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded shrink-0">
                          Host
                        </span>
                      )}
                    </div>
                    {player.streak > 0 && (
                      <div className="flex items-center gap-1 text-orange-500 text-xs">
                        <Flame className="w-3 h-3" />
                        <span className="font-bold">{player.streak}er Streak</span>
                      </div>
                    )}
                  </div>

                  {/* Rank Change Indicator */}
                  <div className="shrink-0">
                    {player.rankChange === 'up' && (
                      <motion.div
                        initial={{ y: 5 }}
                        animate={{ y: 0 }}
                        className="flex items-center text-green-500"
                      >
                        <TrendingUp className="w-4 h-4" />
                      </motion.div>
                    )}
                    {player.rankChange === 'down' && (
                      <motion.div
                        initial={{ y: -5 }}
                        animate={{ y: 0 }}
                        className="flex items-center text-red-500"
                      >
                        <TrendingDown className="w-4 h-4" />
                      </motion.div>
                    )}
                    {player.rankChange === 'same' && (
                      <div className="text-muted-foreground">
                        <Minus className="w-4 h-4" />
                      </div>
                    )}
                  </div>

                  {/* Score */}
                  <div className="text-right shrink-0">
                    <p className={cn(
                      "font-mono font-black text-lg sm:text-xl",
                      rankConfig?.text || 'text-foreground'
                    )}>
                      {player.score.toLocaleString()}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Gap to leader indicator */}
        {players.length > 1 && leader && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-4 text-center"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass text-xs sm:text-sm text-muted-foreground">
              <Zap className="w-3 h-3 sm:w-4 sm:h-4" />
              <span>
                {players[1]?.name} braucht noch{' '}
                <span className="font-bold text-primary">
                  {(leader.score - (players[1]?.score || 0)).toLocaleString()}
                </span>{' '}
                Punkte
              </span>
            </div>
          </motion.div>
        )}

        {/* Next Round Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="mt-6 sm:mt-8 text-center"
        >
          {isHost ? (
            <Button
              onClick={handleNext}
              className={cn(
                "btn-3d px-6 sm:px-8 py-4 sm:py-6 font-bold text-base sm:text-lg",
                isFinalRound 
                  ? "bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-black glow-accent"
                  : "bg-primary hover:bg-primary/90 glow-primary"
              )}
            >
              {isFinalRound ? (
                <>
                  <Sparkles className="w-5 h-5 mr-2" />
                  Endergebnis
                </>
              ) : (
                <>
                  Weiter
                  <ArrowRight className="w-5 h-5 ml-2" />
                </>
              )}
            </Button>
          ) : (
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className="w-2 h-2 rounded-full bg-primary/50"
              />
              <span className="text-sm sm:text-base">
                {isFinalRound ? 'Gleich kommt das Endergebnis...' : 'Warte auf Host...'}
              </span>
            </div>
          )}
        </motion.div>
      </div>
    </motion.main>
  );
}
