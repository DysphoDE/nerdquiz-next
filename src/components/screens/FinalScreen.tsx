'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket } from '@/hooks/useSocket';
import { useGameStore } from '@/store/gameStore';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { 
  Trophy, 
  Crown, 
  Home, 
  Sparkles, 
  RotateCcw, 
  X, 
  Check,
  Clock,
  Users,
  Timer,
  Calculator,
  TrendingUp,
  TrendingDown,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function FinalScreen() {
  const router = useRouter();
  const { leaveGame, voteRematch } = useSocket();
  const finalRankings = useGameStore((s) => s.finalRankings);
  const gameStatistics = useGameStore((s) => s.gameStatistics);
  const playerId = useGameStore((s) => s.playerId);
  const room = useGameStore((s) => s.room);
  
  const [hasVoted, setHasVoted] = useState(false);
  const [myVote, setMyVote] = useState<'yes' | 'no' | null>(null);
  const [showConfetti, setShowConfetti] = useState(true);
  const [showStats, setShowStats] = useState(false);

  // Check if we're in rematch voting phase
  const isRematchVoting = room?.phase === 'rematch_voting';
  const rematchVotes = room?.rematchVotes || {};
  const timerEnd = room?.timerEnd || 0;
  
  // Calculate time left
  const [timeLeft, setTimeLeft] = useState(20);
  
  useEffect(() => {
    if (!isRematchVoting || timerEnd === 0) return;
    
    const updateTimer = () => {
      const remaining = Math.max(0, Math.ceil((timerEnd - Date.now()) / 1000));
      setTimeLeft(remaining);
    };
    
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [isRematchVoting, timerEnd]);

  // Show stats after a delay
  useEffect(() => {
    const timer = setTimeout(() => setShowStats(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  // Get vote counts
  const voteCounts = useMemo(() => {
    const votes = Object.values(rematchVotes);
    return {
      yes: votes.filter(v => v === 'yes').length,
      no: votes.filter(v => v === 'no').length,
      total: votes.length,
    };
  }, [rematchVotes]);

  // Connected players
  const connectedPlayers = useMemo(() => {
    return room?.players?.filter(p => p.isConnected) || [];
  }, [room?.players]);

  const handleLeave = () => {
    leaveGame();
    router.push('/');
  };

  const handleVote = (vote: 'yes' | 'no') => {
    if (hasVoted) return;
    setHasVoted(true);
    setMyVote(vote);
    voteRematch(vote);
  };

  // Confetti on mount
  useEffect(() => {
    if (!showConfetti) return;
    
    const fire = async () => {
      try {
        const confetti = (await import('canvas-confetti')).default;
        
        // Initial burst
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#00d4ff', '#ff0080', '#ffcc00'],
        });

        // Side cannons
        setTimeout(() => {
          confetti({ particleCount: 50, angle: 60, spread: 55, origin: { x: 0 } });
          confetti({ particleCount: 50, angle: 120, spread: 55, origin: { x: 1 } });
        }, 300);
      } catch {}
    };
    fire();
    
    setTimeout(() => setShowConfetti(false), 1000);
  }, [showConfetti]);

  if (!finalRankings || finalRankings.length === 0) return null;

  const winner = finalRankings[0];
  const podium = finalRankings.slice(0, 3);
  const rest = finalRankings.slice(3);

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen flex flex-col p-3 sm:p-6 relative overflow-hidden"
    >
      {/* Background glow */}
      <div className="absolute inset-0 bg-gradient-glow opacity-30 pointer-events-none" />
      
      <div className="max-w-3xl mx-auto w-full flex-1 flex flex-col relative z-10">
        
        {/* Champion Section */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', duration: 0.8 }}
          className="text-center py-4 sm:py-6"
        >
          <motion.div
            animate={{ rotate: [0, -5, 5, -5, 0] }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="inline-block mb-3"
          >
            <Trophy className="w-14 h-14 sm:w-16 sm:h-16 mx-auto text-accent drop-shadow-[0_0_30px_rgba(255,200,0,0.5)]" />
          </motion.div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black bg-gradient-to-r from-yellow-400 via-amber-400 to-yellow-500 bg-clip-text text-transparent mb-2">
            CHAMPION
          </h1>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="inline-flex items-center gap-3 glass rounded-2xl p-3 sm:p-4 border border-yellow-500/30"
          >
            <div className="relative">
              <img
                src={`https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(winner.avatarSeed)}&mood=superHappy`}
                alt=""
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-muted border-2 border-yellow-500"
              />
              <Crown className="absolute -top-2 -right-2 w-5 h-5 text-yellow-500" />
            </div>
            <div className="text-left">
              <p className="text-lg sm:text-xl font-bold">{winner.name}</p>
              <p className="text-yellow-500 font-mono font-bold text-xl sm:text-2xl">
                {winner.score.toLocaleString()} <span className="text-sm font-normal">Punkte</span>
              </p>
            </div>
          </motion.div>
        </motion.div>

        {/* Podium - All players with points */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="flex items-end justify-center gap-2 sm:gap-3 mb-4"
        >
          {/* 2nd Place */}
          {podium[1] && (
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="flex flex-col items-center"
            >
              <img
                src={`https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(podium[1].avatarSeed)}&mood=happy`}
                alt=""
                className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg bg-muted mb-1 ring-2 ring-slate-400"
              />
              <p className="font-bold text-xs truncate max-w-[70px] sm:max-w-[90px]">{podium[1].name}</p>
              <p className="font-mono text-xs text-slate-400 font-bold">{podium[1].score.toLocaleString()}</p>
              <div className="w-18 sm:w-20 h-14 sm:h-16 bg-gradient-to-t from-slate-500 to-slate-400 rounded-t-lg flex items-center justify-center mt-1">
                <span className="text-xl font-black text-white">2</span>
              </div>
            </motion.div>
          )}

          {/* 1st Place */}
          {podium[0] && (
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="flex flex-col items-center"
            >
              <Sparkles className="w-4 h-4 text-yellow-500 mb-0.5 animate-pulse" />
              <img
                src={`https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(podium[0].avatarSeed)}&mood=superHappy`}
                alt=""
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg bg-muted mb-1 ring-2 ring-yellow-500"
              />
              <p className="font-bold text-xs truncate max-w-[80px] sm:max-w-[100px]">{podium[0].name}</p>
              <p className="font-mono text-xs text-yellow-500 font-bold">{podium[0].score.toLocaleString()}</p>
              <div className="w-22 sm:w-24 h-18 sm:h-20 bg-gradient-to-t from-yellow-600 to-yellow-500 rounded-t-lg flex items-center justify-center mt-1">
                <Crown className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
              </div>
            </motion.div>
          )}

          {/* 3rd Place */}
          {podium[2] && (
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="flex flex-col items-center"
            >
              <img
                src={`https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(podium[2].avatarSeed)}&mood=hopeful`}
                alt=""
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg bg-muted mb-1 ring-2 ring-amber-700"
              />
              <p className="font-bold text-xs truncate max-w-[65px] sm:max-w-[85px]">{podium[2].name}</p>
              <p className="font-mono text-xs text-amber-600 font-bold">{podium[2].score.toLocaleString()}</p>
              <div className="w-16 sm:w-18 h-10 sm:h-12 bg-gradient-to-t from-amber-800 to-amber-700 rounded-t-lg flex items-center justify-center mt-1">
                <span className="text-lg font-black text-white">3</span>
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* Rest of Players */}
        {rest.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="space-y-1.5 mb-4"
          >
            {rest.map((player, index) => (
              <div
                key={player.playerId}
                className={cn(
                  'flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-xl glass',
                  player.playerId === playerId && 'ring-1 ring-primary'
                )}
              >
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-muted flex items-center justify-center font-bold text-xs sm:text-sm text-muted-foreground">
                  {index + 4}
                </div>
                <img
                  src={`https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(player.avatarSeed)}&mood=neutral`}
                  alt=""
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-muted"
                />
                <span className="flex-1 font-medium truncate text-sm sm:text-base">{player.name}</span>
                <span className="font-mono font-bold text-primary text-sm sm:text-base">
                  {player.score.toLocaleString()}
                </span>
              </div>
            ))}
          </motion.div>
        )}

        {/* Stats Section */}
        <AnimatePresence>
          {showStats && gameStatistics && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.2 }}
              className="mb-4"
            >
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                {/* Fastest Fingers - Players with shortest avg response time */}
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="glass rounded-xl p-3 border border-green-500/20"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Timer className="w-4 h-4 text-green-500" />
                    <span className="text-xs font-bold text-green-500">SCHNELLE FINGER</span>
                  </div>
                  <div className="space-y-1">
                    {gameStatistics.fastestFingers && gameStatistics.fastestFingers.length > 0 ? (
                      gameStatistics.fastestFingers.map((player, index) => (
                        <div key={player.playerId} className="flex items-center gap-2">
                          <span className="text-xs font-bold text-green-500 w-3">{index + 1}.</span>
                          <img
                            src={`https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(player.avatarSeed)}&mood=neutral`}
                            alt=""
                            className="w-5 h-5 rounded-full bg-muted"
                          />
                          <span className="text-xs truncate flex-1">{player.playerName}</span>
                          <span className="text-xs font-mono font-bold text-green-500">
                            {player.avgResponseTime !== null 
                              ? `${(player.avgResponseTime / 1000).toFixed(1)}s` 
                              : '-'}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">Zu wenig Daten</p>
                    )}
                  </div>
                </motion.div>

                {/* Best Estimator */}
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="glass rounded-xl p-3 border border-purple-500/20"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Calculator className="w-4 h-4 text-purple-500" />
                    <span className="text-xs font-bold text-purple-500">BESTER SCHÄTZER</span>
                  </div>
                  {gameStatistics.bestEstimator ? (
                    <div className="flex items-center gap-2">
                      <img
                        src={`https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(gameStatistics.bestEstimator.avatarSeed)}&mood=superHappy`}
                        alt=""
                        className="w-8 h-8 rounded-full bg-muted border-2 border-purple-500"
                      />
                      <div>
                        <p className="text-sm font-bold">{gameStatistics.bestEstimator.playerName}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {gameStatistics.bestEstimator.points.toLocaleString()} Punkte
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Keine Schätzfragen</p>
                  )}
                </motion.div>

                {/* Best Category */}
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="glass rounded-xl p-3 border border-cyan-500/20"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-cyan-500" />
                    <span className="text-xs font-bold text-cyan-500">STÄRKSTE KATEGORIE</span>
                  </div>
                  {gameStatistics.bestCategory ? (
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                        <Zap className="w-4 h-4 text-cyan-500" />
                      </div>
                      <div>
                        <p className="text-sm font-bold truncate max-w-[100px]">{gameStatistics.bestCategory.category}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {gameStatistics.bestCategory.accuracy}% richtig ({gameStatistics.bestCategory.correct}/{gameStatistics.bestCategory.total})
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Keine Daten</p>
                  )}
                </motion.div>

                {/* Worst Category */}
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  className="glass rounded-xl p-3 border border-orange-500/20"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingDown className="w-4 h-4 text-orange-500" />
                    <span className="text-xs font-bold text-orange-500">SCHWÄCHSTE KATEGORIE</span>
                  </div>
                  {gameStatistics.worstCategory && gameStatistics.worstCategory.category !== gameStatistics.bestCategory?.category ? (
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
                        <TrendingDown className="w-4 h-4 text-orange-500" />
                      </div>
                      <div>
                        <p className="text-sm font-bold truncate max-w-[100px]">{gameStatistics.worstCategory.category}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {gameStatistics.worstCategory.accuracy}% richtig ({gameStatistics.worstCategory.correct}/{gameStatistics.worstCategory.total})
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {gameStatistics.categoryPerformance.length <= 1 ? 'Nur eine Kategorie gespielt' : 'Keine Daten'}
                    </p>
                  )}
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Rematch Voting Section */}
        <AnimatePresence mode="wait">
          {isRematchVoting ? (
            <motion.div
              key="rematch-voting"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mt-auto"
            >
              <Card className="glass p-4 sm:p-5 border border-primary/30">
                <div className="text-center mb-3">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/20 text-primary mb-2">
                    <Clock className="w-4 h-4" />
                    <span className="font-bold">{timeLeft}s</span>
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold mb-1">Nochmal spielen?</h3>
                  <p className="text-xs text-muted-foreground">
                    <Users className="w-3 h-3 inline mr-1" />
                    {voteCounts.total} / {connectedPlayers.length} haben abgestimmt
                  </p>
                </div>

                {/* Vote Buttons */}
                {!hasVoted ? (
                  <div className="flex gap-2 sm:gap-3">
                    <Button
                      onClick={() => handleVote('yes')}
                      className="flex-1 h-12 sm:h-14 text-base font-bold bg-green-600 hover:bg-green-700 text-white"
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Ja!
                    </Button>
                    <Button
                      onClick={() => handleVote('no')}
                      variant="outline"
                      className="flex-1 h-12 sm:h-14 text-base font-bold border-red-500/50 text-red-500 hover:bg-red-500/10"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Nein
                    </Button>
                  </div>
                ) : (
                  <div className="text-center">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className={cn(
                        "inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-base font-bold",
                        myVote === 'yes' ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'
                      )}
                    >
                      {myVote === 'yes' ? (
                        <>
                          <Check className="w-4 h-4" />
                          Nochmal spielen!
                        </>
                      ) : (
                        <>
                          <X className="w-4 h-4" />
                          Tschüss!
                        </>
                      )}
                    </motion.div>
                    
                    {/* Vote Progress */}
                    <div className="mt-3 flex justify-center gap-4 text-sm">
                      <div className="flex items-center gap-1 text-green-500">
                        <Check className="w-3 h-3" />
                        <span className="font-bold">{voteCounts.yes}</span> Ja
                      </div>
                      <div className="flex items-center gap-1 text-red-500">
                        <X className="w-3 h-3" />
                        <span className="font-bold">{voteCounts.no}</span> Nein
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key="waiting"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-auto text-center"
            >
              <div className="flex items-center justify-center gap-2 text-muted-foreground mb-3">
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="w-2 h-2 rounded-full bg-primary/50"
                />
                <span className="text-sm">Gleich kannst du abstimmen...</span>
              </div>
              
              <Button
                onClick={handleLeave}
                variant="outline"
                className="h-10 px-5 text-sm font-bold"
              >
                <Home className="w-4 h-4 mr-2" />
                Zurück zum Start
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.main>
  );
}
