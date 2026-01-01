'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dices, Crown, Clock, Check, RefreshCw, Sparkles } from 'lucide-react';
import { useGameStore } from '@/store/gameStore';
import { getSocket } from '@/lib/socket';
import { cn } from '@/lib/utils';

interface PlayerRollData {
  playerId: string;
  name: string;
  avatarSeed: string;
  rolls: number[] | null;
  sum: number;
}

interface CategorySelectedData {
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
}

// 3D-style dice component
function Dice3D({ 
  value, 
  isRolling, 
  delay = 0,
  size = 'normal'
}: { 
  value: number; 
  isRolling: boolean; 
  delay?: number;
  size?: 'normal' | 'large';
}) {
  const [displayValue, setDisplayValue] = useState(1);
  const [rolling, setRolling] = useState(isRolling);

  useEffect(() => {
    if (!isRolling) {
      setDisplayValue(value);
      setRolling(false);
      return;
    }
    
    setRolling(true);
    let frame = 0;
    const animationFrames = 12;
    
    const interval = setInterval(() => {
      if (frame < animationFrames) {
        setDisplayValue(Math.floor(Math.random() * 6) + 1);
        frame++;
      } else {
        setDisplayValue(value);
        setRolling(false);
        clearInterval(interval);
      }
    }, 60);

    return () => clearInterval(interval);
  }, [value, isRolling]);

  // Dice dot patterns
  const dotPatterns: Record<number, [number, number][]> = {
    1: [[1, 1]],
    2: [[0, 0], [2, 2]],
    3: [[0, 0], [1, 1], [2, 2]],
    4: [[0, 0], [0, 2], [2, 0], [2, 2]],
    5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
    6: [[0, 0], [0, 1], [0, 2], [2, 0], [2, 1], [2, 2]],
  };

  const dots = dotPatterns[displayValue] || [];
  const isLarge = size === 'large';

  return (
    <motion.div
      initial={{ scale: 0, rotateX: -180, rotateY: 180 }}
      animate={{ 
        scale: 1, 
        rotateX: rolling ? [0, 360, 720, 1080] : 0,
        rotateY: rolling ? [0, -360, -720] : 0,
      }}
      transition={{ 
        delay,
        scale: { type: 'spring', stiffness: 300, damping: 20 },
        rotateX: { duration: 0.6, repeat: rolling ? Infinity : 0 },
        rotateY: { duration: 0.8, repeat: rolling ? Infinity : 0 },
      }}
      className={cn(
        "relative rounded-lg shadow-xl",
        "bg-gradient-to-br from-white via-gray-100 to-gray-200",
        "border-2 border-gray-300",
        isLarge ? "w-12 h-12 sm:w-16 sm:h-16" : "w-9 h-9 sm:w-11 sm:h-11"
      )}
      style={{
        boxShadow: rolling 
          ? '0 8px 30px rgba(0,0,0,0.3), inset 0 2px 10px rgba(255,255,255,0.5)'
          : '0 4px 15px rgba(0,0,0,0.2), inset 0 2px 5px rgba(255,255,255,0.3)',
        perspective: '1000px',
        transformStyle: 'preserve-3d',
      }}
    >
      {/* Dice dots */}
      <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 p-2 sm:p-2.5">
        {[0, 1, 2].map((row) =>
          [0, 1, 2].map((col) => {
            const hasDot = dots.some(([r, c]) => r === row && c === col);
            return (
              <div key={`${row}-${col}`} className="flex items-center justify-center">
                {hasDot && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: delay + 0.05 * (row * 3 + col) }}
                    className={cn(
                      "rounded-full bg-gray-800 shadow-inner",
                      isLarge ? "w-2 h-2 sm:w-3 sm:h-3" : "w-1.5 h-1.5 sm:w-2 sm:h-2"
                    )}
                    style={{
                      boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)',
                    }}
                  />
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Shine effect */}
      <div 
        className="absolute inset-0 rounded-lg pointer-events-none"
        style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.4) 0%, transparent 50%, rgba(0,0,0,0.1) 100%)',
        }}
      />
    </motion.div>
  );
}

export function DiceRoyaleScreen() {
  const room = useGameStore((s) => s.room);
  const playerId = useGameStore((s) => s.playerId);
  
  const [phase, setPhase] = useState<'rolling' | 'reroll' | 'result' | 'picking' | 'selected'>('rolling');
  const [playerRolls, setPlayerRolls] = useState<Map<string, number[] | null>>(new Map());
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [tiedPlayerIds, setTiedPlayerIds] = useState<string[] | null>(null);
  const [hasRolled, setHasRolled] = useState(false);
  const [isRolling, setIsRolling] = useState(false);
  const [timeLeft, setTimeLeft] = useState(15);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [revealedCategory, setRevealedCategory] = useState<CategorySelectedData | null>(null);
  const [round, setRound] = useState(1);

  const categories = room?.votingCategories || [];
  const players = room?.players || [];
  const isWinner = playerId === winnerId;
  
  // Am I eligible to roll?
  const canRoll = useMemo(() => {
    if (phase !== 'rolling') return false;
    if (hasRolled) return false;
    if (tiedPlayerIds && !tiedPlayerIds.includes(playerId || '')) return false;
    return true;
  }, [phase, hasRolled, tiedPlayerIds, playerId]);

  // Build player roll data for display
  const playerRollData: PlayerRollData[] = useMemo(() => {
    return players.map(p => {
      const rolls = playerRolls.get(p.id) || null;
      return {
        playerId: p.id,
        name: p.name,
        avatarSeed: p.avatarSeed,
        rolls,
        sum: rolls ? rolls[0] + rolls[1] : 0,
      };
    }).sort((a, b) => b.sum - a.sum);
  }, [players, playerRolls]);

  // Socket event listeners
  useEffect(() => {
    const socket = getSocket();

    const handleRoyaleStart = (data: { players: { id: string; name: string; avatarSeed: string }[] }) => {
      console.log('🎲 Dice Royale start:', data.players.length, 'players');
      const rolls = new Map<string, number[] | null>();
      data.players.forEach(p => rolls.set(p.id, null));
      setPlayerRolls(rolls);
      setPhase('rolling');
      setHasRolled(false);
      setWinnerId(null);
      setTiedPlayerIds(null);
      setRound(1);
      setSelectedCategory(null);
      setRevealedCategory(null);
    };

    const handleRoyaleReady = () => {
      console.log('🎲 Dice Royale ready to roll');
      setHasRolled(false);
    };

    const handleDiceRoll = (data: { playerId: string; rolls: number[] }) => {
      console.log('🎲 Dice roll:', data);
      setPlayerRolls(prev => {
        const next = new Map(prev);
        next.set(data.playerId, data.rolls);
        return next;
      });
      if (data.playerId === playerId) {
        setIsRolling(false);
      }
    };

    const handleRoyaleTie = (data: { tiedPlayerIds: string[]; round: number }) => {
      console.log('🎲 Dice Royale tie!', data.tiedPlayerIds);
      setTiedPlayerIds(data.tiedPlayerIds);
      setRound(data.round);
      setPhase('reroll');
      setTimeout(() => {
        setPlayerRolls(prev => {
          const next = new Map(prev);
          data.tiedPlayerIds.forEach(pid => next.set(pid, null));
          return next;
        });
        setHasRolled(false);
        setPhase('rolling');
      }, 2500);
    };

    const handleRoyaleWinner = (data: { winnerId: string; winnerName: string; winningSum: number }) => {
      console.log('🎲 Dice Royale winner:', data);
      setWinnerId(data.winnerId);
      setPhase('result');
    };

    const handleRoyalePick = () => {
      console.log('🎲 Winner can now pick');
      setPhase('picking');
    };

    const handleCategorySelected = (data: CategorySelectedData) => {
      console.log('🎲 Category selected:', data);
      setRevealedCategory(data);
      setPhase('selected');
    };

    socket.on('dice_royale_start', handleRoyaleStart);
    socket.on('dice_royale_ready', handleRoyaleReady);
    socket.on('dice_royale_roll', handleDiceRoll);
    socket.on('dice_royale_tie', handleRoyaleTie);
    socket.on('dice_royale_winner', handleRoyaleWinner);
    socket.on('dice_royale_pick', handleRoyalePick);
    socket.on('category_selected', handleCategorySelected);

    return () => {
      socket.off('dice_royale_start', handleRoyaleStart);
      socket.off('dice_royale_ready', handleRoyaleReady);
      socket.off('dice_royale_roll', handleDiceRoll);
      socket.off('dice_royale_tie', handleRoyaleTie);
      socket.off('dice_royale_winner', handleRoyaleWinner);
      socket.off('dice_royale_pick', handleRoyalePick);
      socket.off('category_selected', handleCategorySelected);
    };
  }, [playerId]);

  // Timer for picking phase
  useEffect(() => {
    if (phase !== 'picking' || !room?.timerEnd) return;

    const update = () => {
      const remaining = Math.max(0, Math.ceil((room.timerEnd! - Date.now()) / 1000));
      setTimeLeft(remaining);
    };

    update();
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, [phase, room?.timerEnd]);

  const handleRoll = () => {
    if (!canRoll) return;
    
    setIsRolling(true);
    setHasRolled(true);
    
    const socket = getSocket();
    socket.emit('dice_royale_roll', { roomCode: room?.code, playerId });
  };

  const handlePick = (categoryId: string) => {
    if (!isWinner || selectedCategory || phase !== 'picking') return;
    
    setSelectedCategory(categoryId);
    const socket = getSocket();
    socket.emit('dice_royale_pick', { roomCode: room?.code, playerId, categoryId });
  };

  // Show category reveal
  if (revealedCategory) {
    const winner = players.find(p => p.id === winnerId);
    return (
      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="min-h-screen flex flex-col items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="text-center"
        >
          <motion.div className="text-5xl mb-4">🎲</motion.div>
          
          <div className="flex items-center justify-center gap-3 mb-6">
            <img
              src={`https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(winner?.avatarSeed || '')}&mood=superHappy`}
              alt=""
              className="w-10 h-10 rounded-full bg-muted border-2 border-emerald-500"
            />
            <span className="text-lg">{winner?.name} hat gewählt:</span>
          </div>

          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3, type: 'spring' }}
            className="glass px-12 py-8 rounded-3xl border-2 border-emerald-500/50"
          >
            <span className="text-6xl block mb-4">{revealedCategory.categoryIcon}</span>
            <h2 className="text-4xl font-black bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent">
              {revealedCategory.categoryName}
            </h2>
          </motion.div>
        </motion.div>
      </motion.main>
    );
  }

  // Calculate circle positions for players
  const getCirclePosition = (index: number, total: number, radius: number) => {
    // Start from top (-90deg) and go clockwise
    const angle = (-90 + (360 / total) * index) * (Math.PI / 180);
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  };

  const playerCount = playerRollData.length;
  // Dynamic radius based on player count - smaller for mobile
  const baseRadius = playerCount <= 3 ? 90 : playerCount <= 5 ? 110 : 130;

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen flex flex-col p-4"
    >
      {/* Header */}
      <div className="text-center py-4">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/20 text-emerald-400 mb-3"
        >
          <Dices className="w-5 h-5" />
          <span className="font-bold">Dice Royale</span>
          {round > 1 && (
            <span className="text-xs bg-emerald-500/30 px-2 py-0.5 rounded-full">
              Runde {round}
            </span>
          )}
        </motion.div>

        <motion.h1
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="text-xl sm:text-2xl md:text-3xl font-black"
        >
          {phase === 'rolling' && (tiedPlayerIds ? 'Gleichstand! Nochmal würfeln!' : 'Alle würfeln!')}
          {phase === 'reroll' && 'Gleichstand! Nochmal würfeln!'}
          {phase === 'result' && `${players.find(p => p.id === winnerId)?.name} gewinnt!`}
          {phase === 'picking' && 'Der Sieger wählt...'}
        </motion.h1>

        {phase === 'reroll' && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-yellow-500/20 text-yellow-400 text-sm"
          >
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>Nur {tiedPlayerIds?.length} Spieler würfeln erneut</span>
          </motion.div>
        )}
      </div>

      {/* Circle Arena */}
      <div className="flex-1 flex flex-col items-center justify-center overflow-hidden px-2">
        <div 
          className="relative scale-[0.75] sm:scale-100"
          style={{ 
            width: `${baseRadius * 2 + 110}px`, 
            height: `${baseRadius * 2 + 110}px`,
          }}
        >
          {/* Center decoration */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <motion.div
              animate={{ 
                scale: [1, 1.05, 1],
                rotate: [0, 360],
              }}
              transition={{ 
                scale: { duration: 2, repeat: Infinity },
                rotate: { duration: 20, repeat: Infinity, ease: 'linear' },
              }}
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 border-dashed border-emerald-500/30 flex items-center justify-center"
            >
              <motion.div
                animate={{ rotate: [0, -360] }}
                transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
                className="text-2xl sm:text-3xl"
              >
                🎲
              </motion.div>
            </motion.div>
          </div>

          {/* Players in circle */}
          {playerRollData.map((player, index) => {
            const isMe = player.playerId === playerId;
            const isWinnerPlayer = player.playerId === winnerId;
            const isTied = tiedPlayerIds?.includes(player.playerId);
            const needsToRoll = isTied && phase === 'rolling';
            const hasRolledDice = player.rolls !== null;
            
            const pos = getCirclePosition(index, playerCount, baseRadius);

            return (
              <motion.div
                key={player.playerId}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ 
                  scale: 1, 
                  opacity: 1,
                  x: pos.x,
                  y: pos.y,
                }}
                transition={{ 
                  delay: index * 0.1,
                  type: 'spring',
                  stiffness: 300,
                  damping: 25,
                }}
                className="absolute left-1/2 top-1/2"
                style={{
                  marginLeft: '-50px',
                  marginTop: '-55px',
                }}
              >
                <motion.div
                  animate={isWinnerPlayer && phase === 'result' ? {
                    scale: [1, 1.05, 1],
                  } : {}}
                  transition={{ duration: 0.5, repeat: isWinnerPlayer ? Infinity : 0, repeatDelay: 1 }}
                  className={cn(
                    "relative flex flex-col items-center p-2 rounded-xl glass w-[100px]",
                    "transition-all duration-300",
                    isWinnerPlayer && 'ring-2 ring-emerald-500 bg-emerald-500/20',
                    isMe && !isWinnerPlayer && 'ring-2 ring-primary',
                    isTied && phase === 'reroll' && 'ring-2 ring-yellow-500',
                    needsToRoll && 'ring-2 ring-emerald-400 animate-pulse'
                  )}
                >
                  {/* Winner Crown */}
                  <AnimatePresence>
                    {isWinnerPlayer && (
                      <motion.div
                        initial={{ y: -20, opacity: 0, scale: 0 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: -20, opacity: 0 }}
                        className="absolute -top-3 left-1/2 -translate-x-1/2"
                      >
                        <Crown className="w-5 h-5 text-emerald-500 drop-shadow-lg" />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Avatar */}
                  <img
                    src={`https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(player.avatarSeed)}&mood=${isWinnerPlayer ? 'superHappy' : hasRolledDice ? 'hopeful' : 'neutral'}`}
                    alt=""
                    className={cn(
                      "w-9 h-9 rounded-full bg-muted mb-1",
                      isWinnerPlayer && 'border-2 border-emerald-500'
                    )}
                  />

                  {/* Name */}
                  <p className="font-bold text-[10px] truncate w-full text-center mb-1">
                    {player.name}
                    {isMe && <span className="text-primary ml-0.5">(Du)</span>}
                  </p>

                  {/* Dice - compact */}
                  <div className="flex gap-1 justify-center h-10 items-center">
                    {hasRolledDice ? (
                      <>
                        <Dice3D value={player.rolls![0]} isRolling={false} delay={0} size="normal" />
                        <Dice3D value={player.rolls![1]} isRolling={false} delay={0.1} size="normal" />
                      </>
                    ) : (
                      <div className="flex gap-1 opacity-40">
                        <div className="w-9 h-9 rounded-md bg-muted/50 flex items-center justify-center text-sm border border-dashed border-muted-foreground/30">
                          ?
                        </div>
                        <div className="w-9 h-9 rounded-md bg-muted/50 flex items-center justify-center text-sm border border-dashed border-muted-foreground/30">
                          ?
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Sum */}
                  <AnimatePresence>
                    {hasRolledDice && (
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        className={cn(
                          "mt-1 px-2 py-0.5 rounded-full font-mono font-bold text-sm",
                          isWinnerPlayer 
                            ? 'bg-emerald-500 text-white' 
                            : 'bg-muted text-muted-foreground'
                        )}
                      >
                        = {player.sum}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Roll Button */}
      <AnimatePresence>
        {canRoll && (
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className="text-center py-4"
          >
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleRoll}
              disabled={!canRoll}
              className="px-10 py-5 rounded-2xl font-black text-xl sm:text-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30"
            >
              {isRolling ? (
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.3, repeat: Infinity, ease: 'linear' }}
                  className="inline-block"
                >
                  🎲
                </motion.span>
              ) : (
                <>🎲 WÜRFELN! 🎲</>
              )}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Waiting message */}
      <AnimatePresence>
        {phase === 'rolling' && hasRolled && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center py-3 text-muted-foreground animate-pulse text-sm"
          >
            Warte auf andere Spieler...
          </motion.p>
        )}
      </AnimatePresence>

      {/* Not participating in tie-breaker */}
      <AnimatePresence>
        {phase === 'rolling' && tiedPlayerIds && !tiedPlayerIds.includes(playerId || '') && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center py-3 text-muted-foreground text-sm"
          >
            <span className="inline-flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-yellow-500" />
              Warte auf die Stecher...
            </span>
          </motion.p>
        )}
      </AnimatePresence>

      {/* Category Picking */}
      <AnimatePresence>
        {phase === 'picking' && (
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className="pb-4"
          >
            {/* Timer */}
            <div className="text-center mb-3">
              <span className={cn(
                "inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm",
                timeLeft <= 5 ? 'bg-red-500/20 text-red-400' : 'glass'
              )}>
                <Clock className="w-4 h-4" />
                {timeLeft}s
              </span>
            </div>

            {/* Categories */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3 max-w-3xl mx-auto px-2">
              {categories.map((cat, i) => {
                const isSelected = selectedCategory === cat.id;
                return (
                  <motion.button
                    key={cat.id}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.05 * i }}
                    onClick={() => handlePick(cat.id)}
                    disabled={!isWinner || !!selectedCategory}
                    className={cn(
                      "relative p-3 sm:p-4 rounded-xl text-center transition-all",
                      isWinner && !selectedCategory
                        ? 'glass hover:bg-emerald-500/20 hover:border-emerald-500/50 cursor-pointer'
                        : 'glass opacity-60',
                      isSelected && 'ring-2 ring-emerald-500 bg-emerald-500/20'
                    )}
                  >
                    {isSelected && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center"
                      >
                        <Check className="w-3 h-3 text-black" />
                      </motion.div>
                    )}
                    <span className="text-2xl block mb-1">{cat.icon}</span>
                    <span className="font-bold text-xs">{cat.name}</span>
                  </motion.button>
                );
              })}
            </div>

            {!isWinner && (
              <p className="text-center text-muted-foreground mt-4 animate-pulse text-sm">
                Der Sieger wählt die Kategorie...
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.main>
  );
}
