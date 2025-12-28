'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Crown, Clock, Sparkles, Check } from 'lucide-react';
import { useGameStore } from '@/store/gameStore';
import { getSocket } from '@/lib/socket';

interface CategorySelectedData {
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  pickedBy?: string;
}

export function LosersPickScreen() {
  const room = useGameStore((s) => s.room);
  const playerId = useGameStore((s) => s.playerId);
  const [timeLeft, setTimeLeft] = useState(15);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [revealedCategory, setRevealedCategory] = useState<CategorySelectedData | null>(null);

  const categories = room?.votingCategories || [];
  const isLoser = playerId === room?.loserPickPlayerId;
  const loserPlayer = room?.players.find(p => p.id === room?.loserPickPlayerId);

  // Listen for category_selected event
  useEffect(() => {
    const socket = getSocket();

    const handleCategorySelected = (data: CategorySelectedData) => {
      console.log('👑 Category selected by loser:', data);
      setRevealedCategory(data);
      setSelectedCategory(data.categoryId);
    };

    socket.on('category_selected', handleCategorySelected);
    return () => {
      socket.off('category_selected', handleCategorySelected);
    };
  }, []);

  // Timer
  useEffect(() => {
    if (!room?.timerEnd) return;

    const update = () => {
      const remaining = Math.max(0, Math.ceil((room.timerEnd! - Date.now()) / 1000));
      setTimeLeft(remaining);
    };

    update();
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, [room?.timerEnd]);

  const handlePick = (categoryId: string) => {
    if (!isLoser || selectedCategory) return;
    
    setSelectedCategory(categoryId);
    const socket = getSocket();
    socket.emit('loser_pick_category', {
      roomCode: room?.code,
      playerId,
      categoryId,
    });
  };

  // Show revealed category for all players
  if (revealedCategory) {
    return (
      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="min-h-screen flex flex-col items-center justify-center p-4 md:p-8"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className="text-center"
        >
          {/* Crown animation */}
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-6xl mb-4"
          >
            👑
          </motion.div>

          {/* Loser player info */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="flex items-center justify-center gap-3 mb-6"
          >
            <img
              src={`https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(loserPlayer?.avatarSeed || '')}&mood=happy`}
              alt=""
              className="w-12 h-12 rounded-full bg-muted border-2 border-amber-500"
            />
            <span className="text-xl font-bold">{loserPlayer?.name}</span>
            <span className="text-muted-foreground">hat gewählt:</span>
          </motion.div>

          {/* Selected category - big reveal */}
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.5, type: 'spring', stiffness: 300 }}
            className="glass px-12 py-8 rounded-3xl border-2 border-amber-500/50 mb-6"
          >
            <motion.span 
              className="text-7xl block mb-4"
              animate={{ 
                rotate: [0, -10, 10, -5, 5, 0],
                scale: [1, 1.1, 1],
              }}
              transition={{ delay: 0.8, duration: 0.5 }}
            >
              {revealedCategory.categoryIcon}
            </motion.span>
            <motion.h2 
              className="text-4xl md:text-5xl font-black bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
            >
              {revealedCategory.categoryName}
            </motion.h2>
          </motion.div>

          {/* Sparkles effect */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="flex justify-center gap-2"
          >
            {[...Array(5)].map((_, i) => (
              <motion.div
                key={i}
                animate={{
                  y: [0, -15, 0],
                  opacity: [0.5, 1, 0.5],
                }}
                transition={{
                  duration: 1,
                  repeat: Infinity,
                  delay: i * 0.15,
                }}
              >
                <Sparkles className="w-5 h-5 text-amber-500" />
              </motion.div>
            ))}
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
            className="text-muted-foreground mt-6"
          >
            Mach dich bereit...
          </motion.p>
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
      <div className="text-center py-6">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/20 text-amber-500 mb-4"
        >
          <Crown className="w-5 h-5" />
          <span className="font-bold">Loser&apos;s Pick</span>
          <Crown className="w-5 h-5" />
        </motion.div>

        {isLoser ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <h1 className="text-3xl md:text-4xl font-black mb-2">
              Du darfst wählen! 👑
            </h1>
            <p className="text-muted-foreground">
              Als Letztplatzierter hast du die Ehre, die Kategorie zu bestimmen
            </p>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <h1 className="text-3xl md:text-4xl font-black mb-4">
              {loserPlayer?.name} wählt...
            </h1>
            <div className="inline-flex items-center gap-4 px-6 py-4 rounded-2xl glass">
              <motion.img
                src={`https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(loserPlayer?.avatarSeed || '')}&mood=hopeful`}
                alt=""
                className="w-16 h-16 rounded-full bg-muted"
                animate={{ 
                  scale: [1, 1.05, 1],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
              <div className="text-left">
                <p className="font-bold text-xl">{loserPlayer?.name}</p>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  Letztplatzierter
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Timer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-full mt-6 ${
            timeLeft <= 5 ? 'bg-red-500/20 text-red-500' : 'glass'
          }`}
        >
          <Clock className="w-5 h-5" />
          <span className="font-mono font-bold text-lg">{timeLeft}s</span>
        </motion.div>
      </div>

      {/* Categories Grid */}
      <div className="flex-1 flex items-center justify-center">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 max-w-4xl w-full">
          {categories.map((cat, i) => {
            const isSelected = selectedCategory === cat.id;

            return (
              <motion.button
                key={cat.id}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1 + i * 0.05 }}
                onClick={() => handlePick(cat.id)}
                disabled={!isLoser || !!selectedCategory}
                className={`relative p-4 md:p-6 rounded-2xl text-center transition-all ${
                  isLoser && !selectedCategory
                    ? 'glass hover:bg-amber-500/20 hover:border-amber-500/50 hover:scale-105 cursor-pointer'
                    : 'glass'
                } ${!isLoser ? 'opacity-60' : ''} ${isSelected ? 'ring-2 ring-amber-500 bg-amber-500/20' : ''}`}
              >
                {isSelected && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center"
                  >
                    <Check className="w-4 h-4 text-black" />
                  </motion.div>
                )}

                <span className="text-3xl md:text-4xl mb-2 block">{cat.icon}</span>
                <span className="font-bold text-sm md:text-base">{cat.name}</span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Status message */}
      <AnimatePresence>
        {isLoser && selectedCategory && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-center py-4"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/20 text-amber-500">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              >
                <Sparkles className="w-4 h-4" />
              </motion.div>
              <span>Deine Wahl wird übertragen...</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!isLoser && !selectedCategory && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-4"
        >
          <div className="inline-flex items-center gap-2">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-2 h-2 rounded-full bg-amber-500"
                animate={{ y: [0, -8, 0] }}
                transition={{
                  duration: 0.6,
                  repeat: Infinity,
                  delay: i * 0.15,
                }}
              />
            ))}
          </div>
          <p className="text-muted-foreground mt-2">
            Warte auf die Entscheidung...
          </p>
        </motion.div>
      )}
    </motion.main>
  );
}
