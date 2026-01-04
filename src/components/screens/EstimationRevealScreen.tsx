'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, ArrowRight, Crown, TrendingUp, TrendingDown, Sparkles, Crosshair, Trophy, Zap } from 'lucide-react';
import { useSocket } from '@/hooks/useSocket';
import { useGameStore, useIsHost, useMyResult } from '@/store/gameStore';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { getAvatarUrlFromSeed } from '@/components/game/AvatarCustomizer';

// Lustige Sprüche basierend auf Abweichung (Prozent vom korrekten Wert)
// Mehrere Varianten pro Kategorie für Abwechslung
const QUIP_VARIANTS = {
  perfect: [
    { text: 'PERFEKT! Hast du gegoogelt?! 🤯', emoji: '🎯' },
    { text: 'WOW! Exakt richtig! 🎯', emoji: '🎯' },
    { text: 'Unglaublich! Punktlandung! 💯', emoji: '🎯' },
    { text: 'Hellseher oder was?! 🔮', emoji: '🎯' },
    { text: 'Das war EXAKT! Respekt! 👑', emoji: '🎯' },
  ],
  excellent: [ // <= 5%
    { text: 'Krass nah dran!', emoji: '🔥' },
    { text: 'Fast perfekt! 🔥', emoji: '🔥' },
    { text: 'Mega gut geschätzt!', emoji: '🔥' },
    { text: 'So nah, das zählt fast!', emoji: '🔥' },
    { text: 'Hammer-Schätzung!', emoji: '🔥' },
  ],
  veryGood: [ // <= 10%
    { text: 'Sehr gut geschätzt!', emoji: '👏' },
    { text: 'Starke Leistung!', emoji: '👏' },
    { text: 'Top Schätzung!', emoji: '👏' },
    { text: 'Richtig gutes Gefühl!', emoji: '👏' },
    { text: 'Fast wie ein Profi!', emoji: '👏' },
  ],
  good: [ // <= 20%
    { text: 'Solide Schätzung!', emoji: '👍' },
    { text: 'Geht klar!', emoji: '👍' },
    { text: 'Nicht schlecht!', emoji: '👍' },
    { text: 'Passt schon!', emoji: '👍' },
    { text: 'Kann man gelten lassen!', emoji: '👍' },
  ],
  okay: [ // <= 35%
    { text: 'Naja, geht so...', emoji: '😅' },
    { text: 'Mittelmäßig...', emoji: '😅' },
    { text: 'Da geht noch was!', emoji: '😅' },
    { text: 'Könnte besser sein...', emoji: '😅' },
    { text: 'Hm, naja...', emoji: '😅' },
  ],
  bad: [ // <= 50%
    { text: 'Bisschen daneben...', emoji: '🤔' },
    { text: 'Das war eher geraten, oder?', emoji: '🤔' },
    { text: 'Uff, nicht so gut...', emoji: '🤔' },
    { text: 'Schätzung mit Augenbinde?', emoji: '🤔' },
    { text: 'Nächstes Mal besser!', emoji: '🤔' },
  ],
  veryBad: [ // <= 100%
    { text: 'Das war nix, Digga!', emoji: '💀' },
    { text: 'Komplett vorbei!', emoji: '💀' },
    { text: 'Aua, das tat weh...', emoji: '💀' },
    { text: 'Nicht mal in der Nähe!', emoji: '💀' },
    { text: 'Brudi... einfach nein.', emoji: '💀' },
  ],
  terrible: [ // <= 200%
    { text: 'Komplett verpeilt!', emoji: '🤡' },
    { text: 'Alter, was?! 😂', emoji: '🤡' },
    { text: 'Das kann nicht dein Ernst sein!', emoji: '🤡' },
    { text: 'Im falschen Film?', emoji: '🤡' },
    { text: 'Mathelehrer weint gerade...', emoji: '🤡' },
  ],
  catastrophic: [ // > 200%
    { text: 'Alter... was war das?!', emoji: '☠️' },
    { text: 'Auf die Tastatur gefallen? 😭', emoji: '☠️' },
    { text: 'Das war legendär schlecht!', emoji: '☠️' },
    { text: 'Willst du mich verarschen?', emoji: '☠️' },
    { text: 'Du hast keinen Bock mehr, oder?', emoji: '☠️' },
  ],
};

const getQuip = (diffPercent: number, isExact: boolean): { text: string; emoji: string } => {
  let variants: { text: string; emoji: string }[];
  
  if (isExact) {
    variants = QUIP_VARIANTS.perfect;
  } else if (diffPercent <= 5) {
    variants = QUIP_VARIANTS.excellent;
  } else if (diffPercent <= 10) {
    variants = QUIP_VARIANTS.veryGood;
  } else if (diffPercent <= 20) {
    variants = QUIP_VARIANTS.good;
  } else if (diffPercent <= 35) {
    variants = QUIP_VARIANTS.okay;
  } else if (diffPercent <= 50) {
    variants = QUIP_VARIANTS.bad;
  } else if (diffPercent <= 100) {
    variants = QUIP_VARIANTS.veryBad;
  } else if (diffPercent <= 200) {
    variants = QUIP_VARIANTS.terrible;
  } else {
    variants = QUIP_VARIANTS.catastrophic;
  }
  
  // Zufällige Auswahl aus der jeweiligen Kategorie
  return variants[Math.floor(Math.random() * variants.length)];
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
          <Card className="glass p-4 sm:p-8 md:p-12 text-center border-secondary/50 glow-secondary relative overflow-hidden">
            {/* Background effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-secondary/10 via-transparent to-primary/10" />
            
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30, delay: 0.5 }}
              className="relative"
            >
              <Target className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 text-secondary" />
              <p className="text-xs sm:text-sm text-muted-foreground uppercase font-bold tracking-wider mb-2 sm:mb-3">
                Die richtige Antwort ist
              </p>
              <div className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-mono font-black text-secondary">
                <AnimatedNumber 
                  value={correctValue} 
                  duration={2500}
                  onComplete={() => setCountingDone(true)}
                />
                {question.unit && (
                  <span className="text-base sm:text-xl md:text-2xl ml-2 sm:ml-3 text-muted-foreground">
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
                        src={getAvatarUrlFromSeed(result.avatarSeed, result.absDiff === 0 ? 'superHappy' : diffPercent <= 20 ? 'happy' : diffPercent <= 50 ? 'confused' : 'sad')}
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

                    {/* Points Breakdown - Desktop */}
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      transition={{ delay: 0.6 }}
                      className="hidden sm:flex items-center justify-end gap-4 mt-3 pt-3 border-t border-white/10"
                    >
                      {/* Accuracy Points */}
                      {result.accuracyPoints !== undefined && (
                        <div className="flex items-center gap-1.5 text-xs">
                          <Crosshair className="w-3.5 h-3.5 text-blue-400" />
                          <span className="text-muted-foreground">Genauigkeit:</span>
                          <span className={cn(
                            'font-mono font-bold',
                            result.accuracyPoints > 700 ? 'text-green-400' :
                            result.accuracyPoints > 400 ? 'text-yellow-400' :
                            result.accuracyPoints > 0 ? 'text-orange-400' : 'text-red-400'
                          )}>
                            +{result.accuracyPoints}
                          </span>
                        </div>
                      )}
                      
                      {/* Rank Bonus */}
                      {result.rankBonus !== undefined && result.rankBonus > 0 && (
                        <div className="flex items-center gap-1.5 text-xs">
                          <Trophy className="w-3.5 h-3.5 text-amber-400" />
                          <span className="text-muted-foreground">Platz {rank}:</span>
                          <span className="font-mono font-bold text-amber-400">
                            +{result.rankBonus}
                          </span>
                        </div>
                      )}
                      
                      {/* Perfect Bonus */}
                      {result.perfectBonus !== undefined && result.perfectBonus > 0 && (
                        <div className="flex items-center gap-1.5 text-xs">
                          <Zap className="w-3.5 h-3.5 text-purple-400" />
                          <span className="text-muted-foreground">Perfekt:</span>
                          <span className="font-mono font-bold text-purple-400">
                            +{result.perfectBonus}
                          </span>
                        </div>
                      )}
                    </motion.div>

                    {/* Mobile: Quip + Points Breakdown */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.4 }}
                      className="sm:hidden mt-3 pt-3 border-t border-white/10"
                    >
                      <p className="text-xs text-muted-foreground text-center mb-2">
                        {quip.text}
                      </p>
                      <div className="flex items-center justify-center gap-3 text-xs">
                        {result.accuracyPoints !== undefined && (
                          <div className="flex items-center gap-1">
                            <Crosshair className="w-3 h-3 text-blue-400" />
                            <span className={cn(
                              'font-mono font-bold',
                              result.accuracyPoints > 0 ? 'text-blue-400' : 'text-muted-foreground'
                            )}>
                              +{result.accuracyPoints}
                            </span>
                          </div>
                        )}
                        {result.rankBonus !== undefined && result.rankBonus > 0 && (
                          <div className="flex items-center gap-1">
                            <Trophy className="w-3 h-3 text-amber-400" />
                            <span className="font-mono font-bold text-amber-400">
                              +{result.rankBonus}
                            </span>
                          </div>
                        )}
                        {result.perfectBonus !== undefined && result.perfectBonus > 0 && (
                          <div className="flex items-center gap-1">
                            <Zap className="w-3 h-3 text-purple-400" />
                            <span className="font-mono font-bold text-purple-400">
                              +{result.perfectBonus}
                            </span>
                          </div>
                        )}
                      </div>
                    </motion.div>
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

