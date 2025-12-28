'use client';

import { motion } from 'framer-motion';
import { Vote, CircleDot, Crown, Sparkles, Swords, Dices } from 'lucide-react';
import { useGameStore } from '@/store/gameStore';

const MODES: Record<string, { title: string; subtitle: string; icon: any; color: string; bgColor: string; emoji: string }> = {
  voting: {
    title: 'Abstimmung!',
    subtitle: 'Wählt gemeinsam die Kategorie',
    icon: Vote,
    color: 'from-blue-500 to-cyan-500',
    bgColor: 'bg-blue-500/20',
    emoji: '🗳️',
  },
  wheel: {
    title: 'Glücksrad!',
    subtitle: 'Das Schicksal entscheidet...',
    icon: CircleDot,
    color: 'from-purple-500 to-pink-500',
    bgColor: 'bg-purple-500/20',
    emoji: '🎡',
  },
  losers_pick: {
    title: "Loser's Pick!",
    subtitle: 'Der Letzte darf wählen',
    icon: Crown,
    color: 'from-amber-500 to-orange-500',
    bgColor: 'bg-amber-500/20',
    emoji: '👑',
  },
  dice_royale: {
    title: 'Dice Royale!',
    subtitle: 'Alle würfeln - der Höchste gewinnt!',
    icon: Dices,
    color: 'from-emerald-500 to-teal-500',
    bgColor: 'bg-emerald-500/20',
    emoji: '🎲',
  },
  rps_duel: {
    title: 'Schere, Stein, Papier!',
    subtitle: 'Zwei Spieler im Duell - Best of 3',
    icon: Swords,
    color: 'from-red-500 to-rose-500',
    bgColor: 'bg-red-500/20',
    emoji: '✊',
  },
};

export function CategoryAnnouncementScreen() {
  const room = useGameStore((s) => s.room);
  const mode = room?.categorySelectionMode || 'voting';
  const modeConfig = MODES[mode];
  const Icon = modeConfig.icon;

  // Find loser player name if applicable
  const loserPlayer = mode === 'losers_pick' && room?.loserPickPlayerId
    ? room.players.find(p => p.id === room.loserPickPlayerId)
    : null;

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen flex items-center justify-center p-4"
    >
      <div className="text-center max-w-lg">
        {/* Round indicator */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <span className="text-sm text-muted-foreground font-medium">
            Runde {room?.currentRound} von {room?.settings.maxRounds}
          </span>
        </motion.div>

        {/* Big emoji with background */}
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.2 }}
          className={`inline-flex items-center justify-center w-32 h-32 rounded-3xl ${modeConfig.bgColor} mb-6`}
        >
          <span className="text-7xl">{modeConfig.emoji}</span>
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className={`text-5xl md:text-6xl font-black mb-4 bg-gradient-to-r ${modeConfig.color} bg-clip-text text-transparent`}
        >
          {modeConfig.title}
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-xl text-muted-foreground mb-8"
        >
          {modeConfig.subtitle}
        </motion.p>

        {/* Loser player highlight */}
        {mode === 'losers_pick' && loserPlayer && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6 }}
            className="inline-flex items-center gap-4 px-6 py-4 rounded-2xl glass border-amber-500/50"
          >
            <img
              src={`https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(loserPlayer.avatarSeed)}&mood=hopeful`}
              alt=""
              className="w-12 h-12 rounded-full bg-muted"
            />
            <div className="text-left">
              <p className="text-sm text-muted-foreground">Es wählt:</p>
              <p className="text-xl font-bold">{loserPlayer.name}</p>
            </div>
            <Sparkles className="w-6 h-6 text-amber-500" />
          </motion.div>
        )}

        {/* Loading dots */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="flex justify-center gap-2 mt-8"
        >
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className={`w-3 h-3 rounded-full bg-gradient-to-r ${modeConfig.color}`}
              animate={{ y: [0, -10, 0] }}
              transition={{
                duration: 0.6,
                repeat: Infinity,
                delay: i * 0.2,
              }}
            />
          ))}
        </motion.div>
      </div>
    </motion.main>
  );
}

