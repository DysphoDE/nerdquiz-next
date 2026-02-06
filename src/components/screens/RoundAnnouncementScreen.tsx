'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, 
  Gift, 
  Zap,
  Star,
} from 'lucide-react';
import { useGameStore } from '@/store/gameStore';
import { useAudio } from '@/hooks/useAudio';
import { cn } from '@/lib/utils';
import {
  getCategoryModesForRoulette,
  getBonusTypesForRoulette,
  getCategoryModeConfig,
  getBonusTypeConfig,
  IMPLEMENTED_BONUS_TYPES,
  type RouletteItem,
} from '@/config/gameModes';

// ============================================
// ROULETTE COMPONENT
// ============================================

function MarioPartyRoulette({ 
  items, 
  selectedId, 
  onComplete,
  size = 'normal',
}: { 
  items: RouletteItem[];
  selectedId: string;
  onComplete?: () => void;
  size?: 'normal' | 'large';
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSpinning, setIsSpinning] = useState(true);
  const [showResult, setShowResult] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasCompleted = useRef(false);
  
  // Store the target index at mount time to prevent changes during animation
  const targetIndexRef = useRef<number>(-1);
  const totalItems = items.length;

  // Calculate and lock the target index on mount
  useEffect(() => {
    const idx = items.findIndex(item => item.id === selectedId);
    targetIndexRef.current = idx >= 0 ? idx : 0;
    console.log(`🎰 Roulette target: ${selectedId} -> index ${targetIndexRef.current}`);
  }, []); // Only run once on mount

  useEffect(() => {
    if (!isSpinning || hasCompleted.current || totalItems === 0) return;

    let speed = 50; // Start fast
    let elapsed = 0;
    const totalDuration = 2800; // 2.8 seconds total
    const slowdownStart = 1800; // Start slowing at 1.8s
    
    // Get the target index
    const finalIndex = targetIndexRef.current >= 0 ? targetIndexRef.current : 0;

    const tick = () => {
      elapsed += speed;
      
      setCurrentIndex(prev => (prev + 1) % totalItems);

      // Slowdown logic - exponential deceleration
      if (elapsed > slowdownStart) {
        const progress = (elapsed - slowdownStart) / (totalDuration - slowdownStart);
        speed = 50 + Math.pow(progress, 2.5) * 500; // Smoother exponential slowdown
      }

      if (elapsed >= totalDuration) {
        // Final landing on the correct item
        setCurrentIndex(finalIndex);
        setIsSpinning(false);
        hasCompleted.current = true;
        
        console.log(`🎰 Roulette landed on index ${finalIndex}: ${items[finalIndex]?.name}`);
        
        setTimeout(() => {
          setShowResult(true);
          onComplete?.();
        }, 400);
        return;
      }

      intervalRef.current = setTimeout(tick, speed);
    };

    // Start after a small delay
    intervalRef.current = setTimeout(tick, 100);

    return () => {
      if (intervalRef.current) clearTimeout(intervalRef.current);
    };
  }, [isSpinning, totalItems, onComplete, items]);

  const currentItem = items[currentIndex];
  const isLarge = size === 'large';

  return (
    <div className="relative">
      {/* Roulette Frame */}
      <motion.div 
        className={cn(
          "relative overflow-hidden rounded-xl sm:rounded-2xl glass border-2",
          isSpinning ? "border-primary/50" : "border-green-500/50"
        )}
        animate={isSpinning ? { 
          boxShadow: [
            '0 0 20px rgba(0, 200, 200, 0.3)',
            '0 0 40px rgba(0, 200, 200, 0.5)',
            '0 0 20px rgba(0, 200, 200, 0.3)',
          ]
        } : {
          boxShadow: '0 0 30px rgba(34, 197, 94, 0.4)'
        }}
        transition={{ duration: 0.3, repeat: isSpinning ? Infinity : 0 }}
      >
        {/* Side indicators */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 sm:w-2 h-6 sm:h-8 bg-primary rounded-r-full z-10" />
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 sm:w-2 h-6 sm:h-8 bg-primary rounded-l-full z-10" />
        
        {/* Current item display */}
        <motion.div
          key={`${currentIndex}-${isSpinning}`}
          initial={{ y: isSpinning ? -30 : 0, opacity: isSpinning ? 0.7 : 1, scale: isSpinning ? 0.95 : 1 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ duration: isSpinning ? 0.04 : 0.3, ease: isSpinning ? 'linear' : 'easeOut' }}
          className={cn(
            "flex items-center justify-center gap-2 sm:gap-4 px-4 sm:px-8",
            isLarge ? "py-5 sm:py-8" : "py-4 sm:py-6"
          )}
        >
          {/* Emoji */}
          <motion.span 
            className={cn(
              isLarge ? "text-4xl sm:text-6xl" : "text-3xl sm:text-5xl"
            )}
            animate={!isSpinning && showResult ? { 
              scale: [1, 1.3, 1.1],
              rotate: [0, -15, 15, -5, 0]
            } : {}}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            {currentItem?.emoji}
          </motion.span>
          
          {/* Name with gradient */}
          <motion.span 
            className={cn(
              "font-black bg-clip-text text-transparent",
              isLarge ? "text-xl sm:text-4xl" : "text-lg sm:text-3xl",
              `bg-gradient-to-r ${currentItem?.color}`
            )}
            animate={!isSpinning && showResult ? {
              scale: [1, 1.1, 1]
            } : {}}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            {currentItem?.name}
          </motion.span>
        </motion.div>
        
        {/* Landing flash effect */}
        <AnimatePresence>
          {showResult && (
            <motion.div
              initial={{ opacity: 0.8 }}
              animate={{ opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="absolute inset-0 bg-green-500/20 rounded-2xl pointer-events-none"
            />
          )}
        </AnimatePresence>

        {/* Spinning particles - hidden on mobile for performance */}
        {isSpinning && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden hidden sm:block">
            {[...Array(6)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-1 h-1 rounded-full bg-primary"
                style={{
                  left: `${10 + i * 15}%`,
                  top: '50%',
                }}
                animate={{
                  y: [-20, 20],
                  opacity: [0, 1, 0],
                }}
                transition={{
                  duration: 0.3,
                  repeat: Infinity,
                  delay: i * 0.05,
                }}
              />
            ))}
          </div>
        )}
      </motion.div>

      {/* Result sparkles - smaller on mobile */}
      <AnimatePresence>
        {showResult && (
          <>
            {[...Array(8)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute"
                style={{
                  left: '50%',
                  top: '50%',
                }}
                initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
                animate={{ 
                  scale: [0, 1, 0],
                  x: Math.cos(i * Math.PI / 4) * (typeof window !== 'undefined' && window.innerWidth < 640 ? 60 : 100),
                  y: Math.sin(i * Math.PI / 4) * (typeof window !== 'undefined' && window.innerWidth < 640 ? 40 : 60),
                  opacity: [1, 1, 0],
                }}
                transition={{ duration: 0.6, delay: i * 0.05 }}
              >
                <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 text-yellow-400" />
              </motion.div>
            ))}
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================
// MINI SLOT MACHINE (for preview during spin)
// ============================================

function MiniSlots({ items, spinning }: { items: RouletteItem[]; spinning: boolean }) {
  return (
    <motion.div 
      className="flex gap-1.5 sm:gap-2 justify-center flex-wrap"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      {items.slice(0, 5).map((item, i) => (
        <motion.div
          key={item.id}
          className={cn(
            "w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center text-base sm:text-xl",
            "bg-muted/50 border border-border/50"
          )}
          animate={spinning ? {
            y: [0, -5, 0],
            opacity: [0.5, 1, 0.5],
          } : {}}
          transition={{
            duration: 0.3,
            repeat: spinning ? Infinity : 0,
            delay: i * 0.1,
          }}
        >
          {item.emoji}
        </motion.div>
      ))}
      {items.length > 5 && (
        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center text-xs text-muted-foreground bg-muted/30">
          +{items.length - 5}
        </div>
      )}
    </motion.div>
  );
}

// ============================================
// MAIN SCREEN
// ============================================

export function RoundAnnouncementScreen() {
  const room = useGameStore((s) => s.room);
  const [rouletteComplete, setRouletteComplete] = useState(false);
  const [showDescription, setShowDescription] = useState(false);
  const { playSfx } = useAudio();

  // Play wheel spin sound when roulette starts
  useEffect(() => {
    playSfx('wheelSpin');
  }, [playSfx]);
  
  if (!room) return null;

  const currentRound = room.currentRound;
  const maxRounds = room.settings.maxRounds;
  
  // Check if this is a bonus round announcement
  const isBonusRound = room.phase === 'bonus_round_announcement';
  
  // Category mode for normal rounds
  const categoryMode = room.categorySelectionMode || 'voting';
  
  // Prepare roulette items from central config
  const rouletteItems: RouletteItem[] = useMemo(() => {
    if (isBonusRound) {
      // Für Bonusrunden: Zeige alle Typen für visuellen Flair,
      // aber wähle nur aus implementierten
      return getBonusTypesForRoulette(false, true);
    } else {
      return getCategoryModesForRoulette();
    }
  }, [isBonusRound]);

  // Selected ID - für Bonusrunden aus room.selectedBonusType lesen
  const selectedId = useMemo(() => {
    if (isBonusRound) {
      // Verwende den vom Server ausgewählten Bonus-Typ
      return room.selectedBonusType || 'collective_list';
    }
    return categoryMode;
  }, [isBonusRound, categoryMode, room.selectedBonusType]);
  
  // Get config for display after roulette
  const selectedConfig = useMemo(() => {
    if (isBonusRound) {
      return getBonusTypeConfig(selectedId);
    }
    return getCategoryModeConfig(selectedId);
  }, [isBonusRound, selectedId]);

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen flex items-center justify-center p-3 sm:p-4 relative overflow-hidden"
    >
      {/* Animated background */}
      <div className="absolute inset-0 bg-gradient-glow opacity-50" />
      
      {/* Floating particles - fewer on mobile */}
      <div className="absolute inset-0 pointer-events-none hidden sm:block">
        {[...Array(12)].map((_, i) => (
          <motion.div
            key={i}
            className={cn(
              "absolute rounded-full",
              i % 3 === 0 ? "w-2 h-2 bg-primary/30" : 
              i % 3 === 1 ? "w-1.5 h-1.5 bg-secondary/30" : 
              "w-1 h-1 bg-accent/30"
            )}
            style={{
              left: `${5 + (i * 8)}%`,
              top: `${10 + (i % 5) * 18}%`,
            }}
            animate={{
              y: [0, -30, 0],
              x: [0, i % 2 === 0 ? 10 : -10, 0],
              opacity: [0.3, 0.7, 0.3],
            }}
            transition={{
              duration: 3 + i * 0.3,
              repeat: Infinity,
              delay: i * 0.2,
            }}
          />
        ))}
      </div>

      <div className="text-center max-w-2xl relative z-10 w-full px-2">
        {/* Round Badge */}
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="inline-flex items-center gap-1.5 sm:gap-2 px-4 sm:px-6 py-2 sm:py-3 rounded-full glass mb-4 sm:mb-8"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
          >
            <Star className="w-4 h-4 sm:w-5 sm:h-5 text-accent" />
          </motion.div>
          <span className="text-lg sm:text-2xl font-black">
            Runde <span className="text-primary">{currentRound}</span>
            <span className="text-muted-foreground font-normal mx-1">/</span>
            <span className="text-muted-foreground">{maxRounds}</span>
          </span>
          <motion.div
            animate={{ rotate: -360 }}
            transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
          >
            <Star className="w-4 h-4 sm:w-5 sm:h-5 text-accent" />
          </motion.div>
        </motion.div>

        {/* Round Type Title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-4 sm:mb-8"
        >
          {isBonusRound ? (
            <div className="space-y-1 sm:space-y-2">
              <motion.div
                className="inline-flex items-center gap-2 sm:gap-3"
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <Gift className="w-6 h-6 sm:w-10 sm:h-10 text-amber-500" />
                <h1 className="text-3xl sm:text-5xl md:text-6xl font-black bg-gradient-to-r from-amber-400 via-yellow-500 to-orange-500 bg-clip-text text-transparent">
                  BONUSRUNDE!
                </h1>
                <Gift className="w-6 h-6 sm:w-10 sm:h-10 text-amber-500" />
              </motion.div>
              <p className="text-muted-foreground text-sm sm:text-lg">Zeit für etwas Besonderes...</p>
            </div>
          ) : (
            <div className="space-y-1 sm:space-y-2">
              <div className="inline-flex items-center gap-2 sm:gap-3">
                <Zap className="w-5 h-5 sm:w-8 sm:h-8 text-primary" />
                <h1 className="text-3xl sm:text-5xl md:text-6xl font-black bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                  FRAGERUNDE
                </h1>
                <Zap className="w-5 h-5 sm:w-8 sm:h-8 text-primary" />
              </div>
              <p className="text-muted-foreground text-sm sm:text-lg">Wie wird die Kategorie gewählt?</p>
            </div>
          )}
        </motion.div>

        {/* Roulette */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 }}
          className="mb-4 sm:mb-8"
        >
          <MarioPartyRoulette
            items={rouletteItems}
            selectedId={selectedId}
            size={isBonusRound ? 'large' : 'normal'}
            onComplete={() => {
              setShowDescription(true);
              // Nach 1 Sekunde weitergehen (damit Erklärungsbox lesbar ist)
              setTimeout(() => setRouletteComplete(true), 1000);
            }}
          />
        </motion.div>

        {/* Mini slots preview - only show while spinning, hide on very small screens */}
        <AnimatePresence>
          {!showDescription && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ delay: 0.3 }}
              className="mb-4 sm:mb-6 hidden xs:block"
            >
              <MiniSlots items={rouletteItems} spinning={!rouletteComplete} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Result description - shows after roulette lands */}
        <AnimatePresence>
          {showDescription && selectedConfig && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className={cn(
                "glass rounded-xl sm:rounded-2xl p-4 sm:p-6 mx-auto max-w-lg border",
                isBonusRound ? "border-amber-500/30" : "border-primary/30"
              )}
            >
              <motion.p 
                className="text-sm sm:text-lg text-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                {selectedConfig.description}
              </motion.p>
              
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading indicator - only show while spinning */}
        <AnimatePresence>
          {!showDescription && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.8 }}
              className="flex justify-center gap-2 mt-4 sm:mt-8"
            >
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className={cn(
                    "w-2 h-2 sm:w-3 sm:h-3 rounded-full",
                    isBonusRound 
                      ? "bg-gradient-to-r from-amber-500 to-yellow-500" 
                      : "bg-gradient-to-r from-cyan-500 to-blue-500"
                  )}
                  animate={{ y: [0, -10, 0] }}
                  transition={{
                    duration: 0.6,
                    repeat: Infinity,
                    delay: i * 0.2,
                  }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.main>
  );
}

