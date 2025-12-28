'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dices, Crown, Clock, Check, RefreshCw, Sparkles } from 'lucide-react';
import { useGameStore } from '@/store/gameStore';
import { getSocket } from '@/lib/socket';

// Dice faces as Unicode
const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

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
  
  // Am I eligible to roll? (Either in initial round or in tie-breaker)
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
      // Reset rolls for tied players after animation
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

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen flex flex-col p-4 md:p-8"
    >
      {/* Header */}
      <div className="text-center py-4">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/20 text-emerald-400 mb-4"
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
          className="text-2xl md:text-3xl font-black"
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
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-yellow-500/20 text-yellow-400"
          >
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>Nur {tiedPlayerIds?.length} Spieler mit Gleichstand würfeln erneut</span>
          </motion.div>
        )}
      </div>

      {/* Players Grid */}
      <div className="flex-1 flex items-center justify-center">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 max-w-4xl">
          {playerRollData.map((player, index) => {
            const isMe = player.playerId === playerId;
            const isWinnerPlayer = player.playerId === winnerId;
            const isTied = tiedPlayerIds?.includes(player.playerId);
            const needsToRoll = isTied && phase === 'rolling';

            return (
              <motion.div
                key={player.playerId}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: index * 0.05 }}
                className={`relative p-4 rounded-2xl glass text-center transition-all ${
                  isWinnerPlayer ? 'ring-2 ring-emerald-500 bg-emerald-500/20' : ''
                } ${isMe ? 'ring-2 ring-primary' : ''} ${
                  isTied && phase === 'reroll' ? 'ring-2 ring-yellow-500 animate-pulse' : ''
                } ${needsToRoll ? 'ring-2 ring-emerald-400' : ''}`}
              >
                {/* Winner Crown */}
                {isWinnerPlayer && (
                  <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="absolute -top-3 left-1/2 -translate-x-1/2"
                  >
                    <Crown className="w-6 h-6 text-emerald-500" />
                  </motion.div>
                )}

                {/* Avatar */}
                <img
                  src={`https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(player.avatarSeed)}&mood=hopeful`}
                  alt=""
                  className={`w-14 h-14 mx-auto rounded-full bg-muted mb-2 ${
                    isWinnerPlayer ? 'border-2 border-emerald-500' : ''
                  }`}
                />

                {/* Name */}
                <p className="font-bold text-sm truncate mb-2">
                  {player.name}
                  {isMe && <span className="text-primary ml-1">(Du)</span>}
                </p>

                {/* Dice */}
                <div className="flex justify-center gap-1 h-10">
                  {player.rolls ? (
                    <>
                      <DiceDisplay value={player.rolls[0]} delay={0} />
                      <DiceDisplay value={player.rolls[1]} delay={0.1} />
                    </>
                  ) : (
                    <div className="flex gap-1 opacity-40">
                      <div className="w-8 h-8 rounded bg-muted/50 flex items-center justify-center text-lg">🎲</div>
                      <div className="w-8 h-8 rounded bg-muted/50 flex items-center justify-center text-lg">🎲</div>
                    </div>
                  )}
                </div>

                {/* Sum */}
                {player.rolls && (
                  <motion.p
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className={`mt-2 font-mono font-bold text-lg ${
                      isWinnerPlayer ? 'text-emerald-400' : 'text-muted-foreground'
                    }`}
                  >
                    = {player.sum}
                  </motion.p>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Roll Button */}
      {canRoll && (
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="text-center py-6"
        >
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleRoll}
            disabled={!canRoll}
            className="px-12 py-6 rounded-2xl font-black text-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/30"
          >
            {isRolling ? (
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ duration: 0.5, repeat: Infinity, ease: 'linear' }}
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

      {/* Waiting message */}
      {phase === 'rolling' && hasRolled && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-4 text-muted-foreground animate-pulse"
        >
          Warte auf andere Spieler...
        </motion.p>
      )}

      {/* Already rolled indicator for non-participating players in tie-breaker */}
      {phase === 'rolling' && tiedPlayerIds && !tiedPlayerIds.includes(playerId || '') && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-4 text-muted-foreground"
        >
          <span className="inline-flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-yellow-500" />
            Warte auf die Stecher...
          </span>
        </motion.p>
      )}

      {/* Category Picking (for winner) */}
      {phase === 'picking' && (
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="pb-4"
        >
          {/* Timer */}
          <div className="text-center mb-4">
            <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
              timeLeft <= 5 ? 'bg-red-500/20 text-red-400' : 'glass'
            }`}>
              <Clock className="w-4 h-4" />
              {timeLeft}s
            </span>
          </div>

          {/* Categories */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-4xl mx-auto">
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
                  className={`relative p-4 rounded-xl text-center transition-all ${
                    isWinner && !selectedCategory
                      ? 'glass hover:bg-emerald-500/20 hover:border-emerald-500/50 cursor-pointer'
                      : 'glass opacity-60'
                  } ${isSelected ? 'ring-2 ring-emerald-500 bg-emerald-500/20' : ''}`}
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
            <p className="text-center text-muted-foreground mt-4 animate-pulse">
              Der Sieger wählt die Kategorie...
            </p>
          )}
        </motion.div>
      )}
    </motion.main>
  );
}

// Dice Display Component with roll animation
function DiceDisplay({ value, delay }: { value: number; delay: number }) {
  const [displayValue, setDisplayValue] = useState(1);
  const [isAnimating, setIsAnimating] = useState(true);

  useEffect(() => {
    let frame = 0;
    const animationFrames = 8;
    const interval = setInterval(() => {
      if (frame < animationFrames) {
        setDisplayValue(Math.floor(Math.random() * 6) + 1);
        frame++;
      } else {
        setDisplayValue(value);
        setIsAnimating(false);
        clearInterval(interval);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [value]);

  return (
    <motion.div
      initial={{ scale: 0, rotate: -180 }}
      animate={{ 
        scale: 1, 
        rotate: isAnimating ? [0, 360] : 0,
      }}
      transition={{ 
        delay,
        rotate: { duration: 0.4, repeat: isAnimating ? Infinity : 0 }
      }}
      className={`w-8 h-8 rounded bg-white text-black flex items-center justify-center text-xl font-bold shadow-md ${
        isAnimating ? 'animate-bounce' : ''
      }`}
    >
      {DICE_FACES[displayValue - 1]}
    </motion.div>
  );
}

