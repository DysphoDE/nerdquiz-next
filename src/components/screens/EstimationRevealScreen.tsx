'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, ArrowRight, Crown, TrendingUp, TrendingDown, Sparkles } from 'lucide-react';
import { useSocket } from '@/hooks/useSocket';
import { useGameStore, useIsHost, useMyResult } from '@/store/gameStore';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// Lustige Sprüche basierend auf Abweichung (Prozent vom korrekten Wert)
const getQuip = (diffPercent: number, isExact: boolean): { text: string; emoji: string } => {
  if (isExact) {
    return { text: 'PERFEKT! Hast du gegoogelt?! 🤯', emoji: '🎯' };
  }
  if (diffPercent <= 5) {
    return { text: 'Krass nah dran!', emoji: '🔥' };
  }
  if (diffPercent <= 10) {
    return { text: 'Sehr gut geschätzt!', emoji: '👏' };
  }
  if (diffPercent <= 20) {
    return { text: 'Solide Schätzung!', emoji: '👍' };
  }
  if (diffPercent <= 35) {
    return { text: 'Naja, geht so...', emoji: '😅' };
  }
  if (diffPercent <= 50) {
    return { text: 'Bisschen daneben...', emoji: '🤔' };
  }
  if (diffPercent <= 100) {
    return { text: 'Das war nix, Digga!', emoji: '💀' };
  }
  if (diffPercent <= 200) {
    return { text: 'Komplett verpeilt!', emoji: '🤡' };
  }
  return { text: 'Alter... was war das?!', emoji: '☠️' };
};

// Animated counter component
function AnimatedNumber({ 
  value, 
  duration = 2000,
  onComplete 
}: { 
  value: number; 
  duration?: number;
  onComplete?: () => void;
}) {
  const [displayValue, setDisplayValue] = useState(0);
  const startTime = useRef<number | null>(null);
  const frameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const animate = (timestamp: number) => {
      if (!startTime.current) startTime.current = timestamp;
      const progress = Math.min((timestamp - startTime.current) / duration, 1);
      
      // Easing function for smooth deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(value * eased));
      
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(value);
        onComplete?.();
      }
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [value, duration, onComplete]);

  return <>{displayValue.toLocaleString()}</>;
}

export function EstimationRevealScreen() {
  const { next } = useSocket();
  const { room, lastResults } = useGameStore();
  const isHost = useIsHost();
  const myResult = useMyResult();
  
  // Animation states
  const [phase, setPhase] = useState<'counting' | 'revealing' | 'done'>('counting');
  const [revealedIndex, setRevealedIndex] = useState(-1);
  const [countingDone, setCountingDone] = useState(false);

  const question = room?.currentQuestion;
  const correctValue = question?.correctValue ?? 0;

  // Sort results by absDiff (worst to best for reveal animation)
  const sortedResults = lastResults 
    ? [...lastResults].sort((a, b) => {
        const diffA = a.absDiff ?? Infinity;
        const diffB = b.absDiff ?? Infinity;
        return diffB - diffA; // Worst first (will be revealed first)
      })
    : [];

  // Start revealing players after counting is done
  useEffect(() => {
    if (!countingDone || phase !== 'counting') return;
    
    setPhase('revealing');
    
    // Reveal each player one by one
    const revealNext = (index: number) => {
      if (index >= sortedResults.length) {
        setTimeout(() => setPhase('done'), 500);
        return;
      }
      
      setRevealedIndex(index);
      setTimeout(() => revealNext(index + 1), 1200);
    };

    setTimeout(() => revealNext(0), 500);
  }, [countingDone, phase, sortedResults.length]);

  const handleNext = () => {
    if (!isHost) return;
    next();
  };

  if (!question) return null;

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen p-4 sm:p-6 overflow-hidden"
    >
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-6"
        >
          <p className="text-sm text-muted-foreground font-medium mb-2">
            Schätzfrage
          </p>
          <h2 className="text-lg sm:text-xl font-bold text-muted-foreground max-w-2xl mx-auto">
            {question.text}
          </h2>
        </motion.div>

        {/* Correct Answer - Animated Counter */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className="mb-8"
        >
          <Card className="glass p-8 sm:p-12 text-center border-secondary/50 glow-secondary relative overflow-hidden">
            {/* Background effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-secondary/10 via-transparent to-primary/10" />
            
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30, delay: 0.5 }}
              className="relative"
            >
              <Target className="w-12 h-12 mx-auto mb-4 text-secondary" />
              <p className="text-sm text-muted-foreground uppercase font-bold tracking-wider mb-3">
                Die richtige Antwort ist
              </p>
              <div className="text-6xl sm:text-7xl md:text-8xl font-mono font-black text-secondary">
                <AnimatedNumber 
                  value={correctValue} 
                  duration={2500}
                  onComplete={() => setCountingDone(true)}
                />
                {question.unit && (
                  <span className="text-2xl sm:text-3xl ml-3 text-muted-foreground">
                    {question.unit}
                  </span>
                )}
              </div>
            </motion.div>
          </Card>
        </motion.div>

        {/* Player Results - Build up from bottom (worst first at bottom, best last at top) */}
        <div className="flex flex-col-reverse gap-3">
          <AnimatePresence mode="popLayout">
            {sortedResults.map((result, index) => {
              const isRevealed = index <= revealedIndex;
              const isWinner = index === sortedResults.length - 1;
              const diffPercent = result.absDiff !== undefined && result.absDiff !== null
                ? (result.absDiff / Math.max(correctValue, 1)) * 100
                : 100;
              const quip = getQuip(diffPercent, result.absDiff === 0);
              const rank = sortedResults.length - index;

              if (!isRevealed) return null;

              return (
                <motion.div
                  key={result.playerId}
                  initial={{ opacity: 0, y: 50, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ 
                    type: 'spring', 
                    stiffness: 400, 
                    damping: 25,
                  }}
                  layout
                >
                  <Card
                    className={cn(
                      'glass p-4 sm:p-5 relative overflow-hidden transition-all',
                      isWinner && 'border-yellow-500/50 bg-gradient-to-r from-yellow-500/20 via-yellow-500/10 to-transparent glow-accent',
                      result.playerId === myResult?.playerId && !isWinner && 'ring-2 ring-primary'
                    )}
                  >
                    {/* Rank badge */}
                    <div className="flex items-center gap-4">
                      <motion.div
                        initial={{ scale: 0, rotate: -180 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ delay: 0.2, type: 'spring' }}
                        className={cn(
                          'w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl shrink-0',
                          rank === 1 && 'bg-yellow-500 text-black',
                          rank === 2 && 'bg-gray-400 text-black',
                          rank === 3 && 'bg-amber-700 text-white',
                          rank > 3 && 'bg-muted text-muted-foreground'
                        )}
                      >
                        {rank === 1 ? <Crown className="w-6 h-6" /> : rank}
                      </motion.div>

                      {/* Avatar */}
                      <img
                        src={`https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(result.avatarSeed)}&mood=${result.absDiff === 0 ? 'superHappy' : diffPercent <= 20 ? 'happy' : diffPercent <= 50 ? 'confused' : 'sad'}`}
                        alt=""
                        className="w-12 h-12 rounded-full bg-muted shrink-0"
                      />

                      {/* Name & Estimation */}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-lg truncate">{result.playerName}</p>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">Geschätzt:</span>
                          <span className="font-mono font-bold text-primary">
                            {result.estimation?.toLocaleString() ?? '—'}
                          </span>
                          {result.absDiff !== undefined && result.absDiff !== null && (
                            <span className={cn(
                              'flex items-center gap-1 text-xs px-2 py-0.5 rounded-full',
                              result.absDiff === 0 
                                ? 'bg-green-500/20 text-green-500'
                                : 'bg-red-500/20 text-red-500'
                            )}>
                              {result.diff && result.diff > 0 ? (
                                <TrendingUp className="w-3 h-3" />
                              ) : result.diff && result.diff < 0 ? (
                                <TrendingDown className="w-3 h-3" />
                              ) : (
                                <Sparkles className="w-3 h-3" />
                              )}
                              {result.diff && result.diff > 0 ? '+' : ''}{result.diff?.toLocaleString() ?? 0}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Quip & Points */}
                      <div className="text-right shrink-0">
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.3 }}
                          className="text-2xl mb-1"
                        >
                          {quip.emoji}
                        </motion.div>
                        <motion.p
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.4 }}
                          className="text-xs text-muted-foreground max-w-[120px] hidden sm:block"
                        >
                          {quip.text}
                        </motion.p>
                        <motion.p
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ delay: 0.5, type: 'spring' }}
                          className={cn(
                            'font-mono font-bold text-lg',
                            result.points > 0 ? 'text-green-500' : 'text-muted-foreground'
                          )}
                        >
                          +{result.points}
                        </motion.p>
                      </div>
                    </div>

                    {/* Mobile quip */}
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.4 }}
                      className="text-xs text-muted-foreground mt-2 text-center sm:hidden"
                    >
                      {quip.text}
                    </motion.p>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Next Button - only show when done */}
        <AnimatePresence>
          {phase === 'done' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-center mt-8"
            >
              {isHost ? (
                <Button
                  onClick={handleNext}
                  className="btn-3d bg-primary hover:bg-primary/90 px-8 py-6 font-bold text-lg glow-primary"
                >
                  Weiter
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              ) : (
                <p className="text-muted-foreground animate-pulse">
                  Warte auf Host...
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading indicator while revealing */}
        {phase === 'revealing' && revealedIndex < sortedResults.length - 1 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center mt-6"
          >
            <div className="inline-flex items-center gap-2 text-muted-foreground text-sm">
              <div className="w-2 h-2 rounded-full bg-primary animate-ping" />
              Ergebnisse werden geladen...
            </div>
          </motion.div>
        )}
      </div>
    </motion.main>
  );
}

