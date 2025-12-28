'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket } from '@/hooks/useSocket';
import { useGameStore } from '@/store/gameStore';
import { Clock, Check } from 'lucide-react';

interface CategoryPosition {
  id: string;
  element: HTMLElement | null;
}

export function VotingScreen() {
  const { voteCategory } = useSocket();
  const room = useGameStore((s) => s.room);
  const playerId = useGameStore((s) => s.playerId);
  
  const [timeLeft, setTimeLeft] = useState(15);
  const [voted, setVoted] = useState<string | null>(null);
  const categoryRefs = useRef<Map<string, HTMLElement>>(new Map());
  const waitingAreaRef = useRef<HTMLDivElement>(null);

  if (!room) return null;

  const categories = room.votingCategories;
  const votes = room.categoryVotes;
  const myVote = playerId ? votes[playerId] : null;
  const voteCount = Object.keys(votes).length;
  const players = room.players;

  // Timer
  useEffect(() => {
    if (!room.timerEnd) return;
    
    const update = () => {
      const remaining = Math.max(0, Math.ceil((room.timerEnd! - Date.now()) / 1000));
      setTimeLeft(remaining);
    };
    
    update();
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, [room.timerEnd]);

  const handleVote = (categoryId: string) => {
    if (myVote) return;
    setVoted(categoryId);
    voteCategory(categoryId);
  };

  // Players who haven't voted yet
  const waitingPlayers = players.filter(p => !votes[p.id]);
  // Players who have voted
  const votedPlayers = players.filter(p => votes[p.id]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen flex flex-col p-4 md:p-8 overflow-hidden"
    >
      {/* Timer Bar */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-muted z-50">
        <motion.div
          className="h-full bg-gradient-to-r from-primary to-secondary"
          initial={{ width: '100%' }}
          animate={{ width: `${(timeLeft / 15) * 100}%` }}
          transition={{ duration: 0.1 }}
        />
      </div>

      {/* Header */}
      <div className="text-center py-4 md:py-6 relative z-10">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-3"
        >
          <Clock className="w-4 h-4" />
          {timeLeft}s
        </motion.div>

        <motion.h1
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="text-2xl md:text-3xl font-black mb-1"
        >
          Wähle eine Kategorie!
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="text-muted-foreground text-sm"
        >
          Runde {room.currentRound} von {room.settings.maxRounds}
        </motion.p>
      </div>

      {/* Categories Grid */}
      <div className="flex-1 flex items-center justify-center">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 max-w-4xl w-full px-2">
          {categories.map((cat, i) => {
            const isSelected = myVote === cat.id || voted === cat.id;
            const votesForCategory = votedPlayers.filter(p => votes[p.id] === cat.id);

            return (
              <motion.button
                key={cat.id}
                ref={(el) => {
                  if (el) categoryRefs.current.set(cat.id, el);
                }}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.05 * i }}
                onClick={() => handleVote(cat.id)}
                disabled={!!myVote}
                className={`relative p-4 md:p-6 rounded-2xl glass text-center transition-all ${
                  isSelected
                    ? 'ring-2 ring-primary bg-primary/20 scale-105'
                    : 'hover:bg-muted/50 hover:scale-102'
                } ${myVote && !isSelected ? 'opacity-40 scale-95' : ''}`}
              >
                {isSelected && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center"
                  >
                    <Check className="w-4 h-4 text-primary-foreground" />
                  </motion.div>
                )}

                <span className="text-3xl md:text-4xl mb-2 block">{cat.icon}</span>
                <span className="font-bold text-sm md:text-base">{cat.name}</span>

                {/* Voted Players Avatars */}
                {votesForCategory.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-center gap-1 mt-3 flex-wrap"
                  >
                    {votesForCategory.map((player) => (
                      <motion.div
                        key={player.id}
                        layoutId={`avatar-${player.id}`}
                        className="relative group"
                        transition={{
                          type: 'spring',
                          stiffness: 300,
                          damping: 25,
                        }}
                      >
                        <img
                          src={`https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(player.avatarSeed)}&mood=hopeful`}
                          alt={player.name}
                          className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-muted border-2 border-primary shadow-lg"
                        />
                        <motion.div 
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap"
                        >
                          <span className="text-[10px] font-medium bg-primary text-primary-foreground px-1.5 py-0.5 rounded">
                            {player.name}
                          </span>
                        </motion.div>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Waiting Area - Players who haven't voted */}
      <motion.div
        ref={waitingAreaRef}
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="py-4"
      >
        <div className="flex justify-center items-end gap-2 min-h-[80px] relative">
          <AnimatePresence>
            {waitingPlayers.map((player, index) => (
              <WuselingAvatar
                key={player.id}
                player={player}
                index={index}
                total={waitingPlayers.length}
              />
            ))}
          </AnimatePresence>
          
          {waitingPlayers.length === 0 && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-muted-foreground text-sm"
            >
              Alle haben gewählt! ✨
            </motion.p>
          )}
        </div>

        {/* Vote Progress */}
        <div className="text-center mt-2">
          <span className="text-muted-foreground text-sm">
            {voteCount} / {players.length} gewählt
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Wuseling Avatar Component - bounces and moves around randomly
function WuselingAvatar({ 
  player, 
  index,
  total,
}: { 
  player: { id: string; name: string; avatarSeed: string }; 
  index: number;
  total: number;
}) {
  // Random movement parameters for each avatar
  const randomOffset = useMemo(() => ({
    x: (Math.random() - 0.5) * 40,
    baseX: ((index - (total - 1) / 2) * 70),
  }), [index, total]);

  return (
    <motion.div
      layoutId={`avatar-${player.id}`}
      initial={{ scale: 0, y: 50 }}
      animate={{ 
        scale: 1, 
        y: 0,
        x: randomOffset.baseX,
      }}
      exit={{ 
        scale: 0,
        y: -100,
        transition: { duration: 0.3 }
      }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 25,
      }}
      className="relative flex flex-col items-center"
    >
      {/* Avatar with idle animation */}
      <motion.div
        animate={{
          y: [0, -8, 0, -4, 0],
          rotate: [-2, 2, -1, 1, 0],
          x: [0, randomOffset.x * 0.3, 0, randomOffset.x * -0.2, 0],
        }}
        transition={{
          duration: 2 + Math.random(),
          repeat: Infinity,
          ease: 'easeInOut',
          delay: index * 0.2,
        }}
      >
        <motion.img
          src={`https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(player.avatarSeed)}&mood=neutral`}
          alt={player.name}
          className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-muted/80 border-2 border-white/30 shadow-lg cursor-default"
          whileHover={{ scale: 1.1 }}
        />
      </motion.div>
      
      {/* Name label */}
      <motion.div
        initial={{ opacity: 0, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mt-1"
      >
        <span className="text-xs font-medium bg-background/80 px-2 py-0.5 rounded-full border border-white/20 whitespace-nowrap">
          {player.name}
        </span>
      </motion.div>
    </motion.div>
  );
}
