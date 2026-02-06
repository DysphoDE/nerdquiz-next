'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { Dices, Crown, Clock, Check, RefreshCw, Sparkles, X } from 'lucide-react';
import { useGameStore } from '@/store/gameStore';
import { getSocket } from '@/lib/socket';
import { cn } from '@/lib/utils';
import { getAvatarUrlFromSeed } from '@/components/game/AvatarCustomizer';
import { useGameTimer } from '@/components/game';
import { useAudio } from '@/hooks/useAudio';

interface PlayerRollData {
  playerId: string;
  name: string;
  avatarSeed: string;
  rolls: number[] | null;
  sum: number;
  isEliminated: boolean;
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
        isLarge ? "w-10 h-10 sm:w-14 sm:h-14" : "w-8 h-8 sm:w-10 sm:h-10"
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
      <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 p-1.5 sm:p-2">
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
                      isLarge ? "w-1.5 h-1.5 sm:w-2.5 sm:h-2.5" : "w-1 h-1 sm:w-1.5 sm:h-1.5"
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

// Player card component for grid layout
function PlayerCard({
  player,
  isMe,
  isWinner,
  isTied,
  needsToRoll,
  phase,
}: {
  player: PlayerRollData;
  isMe: boolean;
  isWinner: boolean;
  isTied: boolean;
  needsToRoll: boolean;
  phase: string;
}) {
  const hasRolledDice = player.rolls !== null;
  
  return (
    <motion.div
      layout
      initial={{ scale: 0, opacity: 0 }}
      animate={{ 
        scale: player.isEliminated ? 0.9 : 1, 
        opacity: player.isEliminated ? 0.4 : 1,
      }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ 
        type: 'spring',
        stiffness: 400,
        damping: 30,
      }}
      className={cn(
        "relative flex flex-col items-center p-3 sm:p-4 rounded-xl glass",
        "transition-all duration-300",
        isWinner && 'ring-2 ring-emerald-500 bg-emerald-500/20',
        isMe && !isWinner && 'ring-2 ring-primary',
        isTied && phase === 'reroll' && 'ring-2 ring-yellow-500',
        needsToRoll && 'ring-2 ring-emerald-400',
        player.isEliminated && 'grayscale'
      )}
    >
      {/* Winner Crown */}
      <AnimatePresence>
        {isWinner && (
          <motion.div
            initial={{ y: -20, opacity: 0, scale: 0 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -20, opacity: 0 }}
            className="absolute -top-3 left-1/2 -translate-x-1/2"
          >
            <Crown className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-500 drop-shadow-lg" />
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Eliminated indicator */}
      {player.isEliminated && (
        <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
          <X className="w-3 h-3 text-white" />
        </div>
      )}

      {/* Avatar */}
      <img
        src={getAvatarUrlFromSeed(player.avatarSeed, isWinner ? 'superHappy' : player.isEliminated ? 'sad' : hasRolledDice ? 'hopeful' : 'neutral')}
        alt=""
        className={cn(
          "w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-muted mb-2",
          isWinner && 'border-2 border-emerald-500'
        )}
      />

      {/* Name */}
      <p className="font-bold text-xs sm:text-sm truncate max-w-full text-center mb-2">
        {player.name}
        {isMe && <span className="text-primary ml-1">(Du)</span>}
      </p>

      {/* Dice */}
      <div className="flex gap-1.5 sm:gap-2 justify-center min-h-[40px] sm:min-h-[48px] items-center">
        {hasRolledDice ? (
          <>
            <Dice3D value={player.rolls![0]} isRolling={false} delay={0} size="normal" />
            <Dice3D value={player.rolls![1]} isRolling={false} delay={0.1} size="normal" />
          </>
        ) : (
          <div className="flex gap-1.5 opacity-40">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-md bg-muted/50 flex items-center justify-center text-sm border border-dashed border-muted-foreground/30">
              ?
            </div>
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-md bg-muted/50 flex items-center justify-center text-sm border border-dashed border-muted-foreground/30">
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
              "mt-2 px-3 py-1 rounded-full font-mono font-bold text-sm sm:text-base",
              isWinner 
                ? 'bg-emerald-500 text-white' 
                : 'bg-muted text-muted-foreground'
            )}
          >
            = {player.sum}
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Pulsing indicator for current roller */}
      {needsToRoll && !hasRolledDice && (
        <motion.div
          className="absolute inset-0 rounded-xl border-2 border-emerald-400"
          animate={{ 
            opacity: [0.5, 1, 0.5],
            scale: [1, 1.02, 1],
          }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}
    </motion.div>
  );
}

export function DiceRoyaleScreen() {
  const room = useGameStore((s) => s.room);
  const playerId = useGameStore((s) => s.playerId);
  const { playSfx } = useAudio();
  
  const [phase, setPhase] = useState<'rolling' | 'reroll' | 'result' | 'picking' | 'selected'>('rolling');
  const [playerRolls, setPlayerRolls] = useState<Map<string, number[] | null>>(new Map());
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [tiedPlayerIds, setTiedPlayerIds] = useState<string[] | null>(null);
  const [eliminatedPlayerIds, setEliminatedPlayerIds] = useState<Set<string>>(new Set());
  const [hasRolled, setHasRolled] = useState(false);
  const [isRolling, setIsRolling] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [revealedCategory, setRevealedCategory] = useState<CategorySelectedData | null>(null);
  const [round, setRound] = useState(1);

  // Synchronized timer using server time (only for picking phase)
  const { remaining: timeLeft } = useGameTimer(
    phase === 'picking' ? room?.timerEnd ?? null : null,
    room?.serverTime
  );
  
  // Track initial player order to maintain stable positions
  const initialPlayerOrderRef = useRef<string[]>([]);

  const categories = room?.votingCategories || [];
  const players = room?.players || [];
  const isWinner = playerId === winnerId;
  
  // Am I eligible to roll?
  const canRoll = useMemo(() => {
    if (phase !== 'rolling') return false;
    if (hasRolled) return false;
    if (tiedPlayerIds && !tiedPlayerIds.includes(playerId || '')) return false;
    if (eliminatedPlayerIds.has(playerId || '')) return false;
    return true;
  }, [phase, hasRolled, tiedPlayerIds, playerId, eliminatedPlayerIds]);

  // Build player roll data for display - maintain stable order
  const playerRollData: PlayerRollData[] = useMemo(() => {
    // Use initial order if set, otherwise use current players
    const orderToUse = initialPlayerOrderRef.current.length > 0 
      ? initialPlayerOrderRef.current 
      : players.map(p => p.id);
    
    return orderToUse
      .map(pid => {
        const player = players.find(p => p.id === pid);
        if (!player) return null;
        const rolls = playerRolls.get(pid) || null;
        return {
          playerId: pid,
          name: player.name,
          avatarSeed: player.avatarSeed,
          rolls,
          sum: rolls ? rolls[0] + rolls[1] : 0,
          isEliminated: eliminatedPlayerIds.has(pid),
        };
      })
      .filter((p): p is PlayerRollData => p !== null);
  }, [players, playerRolls, eliminatedPlayerIds]);

  // Active (non-eliminated) players for display
  const activePlayers = useMemo(() => 
    playerRollData.filter(p => !p.isEliminated),
    [playerRollData]
  );

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
      setEliminatedPlayerIds(new Set());
      setRound(1);
      setSelectedCategory(null);
      setRevealedCategory(null);
      
      // Store initial player order for stable positioning
      initialPlayerOrderRef.current = data.players.map(p => p.id);
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
      
      // Mark non-tied players as eliminated
      setEliminatedPlayerIds(prev => {
        const next = new Set(prev);
        players.forEach(p => {
          if (!data.tiedPlayerIds.includes(p.id)) {
            next.add(p.id);
          }
        });
        return next;
      });
      
      setTimeout(() => {
        // Clear rolls only for tied players
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
  }, [playerId, players]);

  const handleRoll = () => {
    if (!canRoll) return;
    
    setIsRolling(true);
    setHasRolled(true);
    playSfx('buzz');
    
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
              src={getAvatarUrlFromSeed(winner?.avatarSeed || '', 'superHappy')}
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

  // Determine grid columns based on active player count
  const getGridCols = (count: number) => {
    if (count <= 2) return 'grid-cols-2';
    if (count <= 3) return 'grid-cols-3';
    if (count <= 4) return 'grid-cols-2 sm:grid-cols-4';
    if (count <= 6) return 'grid-cols-2 sm:grid-cols-3';
    return 'grid-cols-2 sm:grid-cols-4';
  };

  // Display either active players only (during tiebreaker) or all players
  const displayPlayers = tiedPlayerIds && phase !== 'result' ? activePlayers : playerRollData;

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen flex flex-col p-4 sm:p-6"
    >
      {/* Header */}
      <div className="text-center py-4 sm:py-6">
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
          {phase === 'rolling' && (tiedPlayerIds ? 'Stechen!' : 'Alle würfeln!')}
          {phase === 'reroll' && 'Gleichstand!'}
          {phase === 'result' && `${players.find(p => p.id === winnerId)?.name} gewinnt!`}
          {phase === 'picking' && 'Der Sieger wählt...'}
        </motion.h1>

        {phase === 'reroll' && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-yellow-500/20 text-yellow-400 text-sm"
          >
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>{tiedPlayerIds?.length} Spieler würfeln nochmal</span>
          </motion.div>
        )}
      </div>

      {/* Players Grid */}
      <div className="flex-1 flex flex-col items-center justify-center px-2">
        {/* Center decoration */}
        <motion.div
          animate={{ 
            scale: [1, 1.1, 1],
            rotate: [0, 5, -5, 0],
          }}
          transition={{ 
            duration: 3,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="text-4xl sm:text-5xl mb-6"
        >
          🎲
        </motion.div>

        <LayoutGroup>
          <motion.div 
            layout
            className={cn(
              "grid gap-3 sm:gap-4 w-full max-w-3xl mx-auto",
              getGridCols(displayPlayers.length)
            )}
          >
            <AnimatePresence mode="popLayout">
              {displayPlayers.map((player) => {
                const isMe = player.playerId === playerId;
                const isWinnerPlayer = player.playerId === winnerId;
                const isTied = tiedPlayerIds?.includes(player.playerId) ?? false;
                const needsToRoll = (tiedPlayerIds ? isTied : true) && phase === 'rolling' && !player.isEliminated;
                
                return (
                  <PlayerCard
                    key={player.playerId}
                    player={player}
                    isMe={isMe}
                    isWinner={isWinnerPlayer}
                    isTied={isTied}
                    needsToRoll={needsToRoll}
                    phase={phase}
                  />
                );
              })}
            </AnimatePresence>
          </motion.div>
        </LayoutGroup>

        {/* Eliminated players indicator during tiebreaker */}
        {tiedPlayerIds && eliminatedPlayerIds.size > 0 && phase !== 'result' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 flex flex-wrap gap-2 justify-center"
          >
            <span className="text-xs text-muted-foreground mr-2">Ausgeschieden:</span>
            {Array.from(eliminatedPlayerIds).map(pid => {
              const player = players.find(p => p.id === pid);
              if (!player) return null;
              return (
                <motion.div
                  key={pid}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="flex items-center gap-1 px-2 py-1 rounded-full bg-muted/50 text-muted-foreground text-xs"
                >
                  <img
                    src={getAvatarUrlFromSeed(player.avatarSeed, 'sad')}
                    alt=""
                    className="w-5 h-5 rounded-full bg-muted grayscale"
                  />
                  <span className="line-through">{player.name}</span>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>

      {/* Roll Button */}
      <AnimatePresence>
        {canRoll && (
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className="text-center py-4 sm:py-6"
          >
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleRoll}
              disabled={!canRoll}
              className="px-8 sm:px-10 py-4 sm:py-5 rounded-2xl font-black text-lg sm:text-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30"
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
        {phase === 'rolling' && hasRolled && !winnerId && (
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
              Warte auf das Stechen...
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
            <div className="text-center mb-4">
              <span className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium",
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
                    <span className="text-2xl sm:text-3xl block mb-1">{cat.icon}</span>
                    <span className="font-bold text-xs sm:text-sm">{cat.name}</span>
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
