'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useSocket } from '@/hooks/useSocket';
import { useGameStore } from '@/store/gameStore';
import { Button } from '@/components/ui/button';
import { Trophy, Crown, Medal, Home, Sparkles } from 'lucide-react';

export function FinalScreen() {
  const router = useRouter();
  const { leaveGame } = useSocket();
  const finalRankings = useGameStore((s) => s.finalRankings);
  const playerId = useGameStore((s) => s.playerId);

  const handleLeave = () => {
    leaveGame();
    router.push('/');
  };

  // Confetti on mount
  useEffect(() => {
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
  }, []);

  if (!finalRankings || finalRankings.length === 0) return null;

  const winner = finalRankings[0];
  const podium = finalRankings.slice(0, 3);
  const rest = finalRankings.slice(3);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen flex flex-col items-center justify-center p-4 md:p-8"
    >
      {/* Winner Celebration */}
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', duration: 0.8 }}
        className="text-center mb-12"
      >
        <motion.div
          animate={{ rotate: [0, -5, 5, -5, 0] }}
          transition={{ duration: 0.5, delay: 0.5 }}
        >
          <Trophy className="w-24 h-24 mx-auto text-accent drop-shadow-[0_0_30px_rgba(255,200,0,0.5)]" />
        </motion.div>

        <h1 className="text-5xl md:text-7xl font-black gradient-text-gold mt-6 mb-4">
          CHAMPION
        </h1>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex items-center justify-center gap-4"
        >
          <img
            src={`https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(winner.avatarSeed)}&mood=superHappy`}
            alt=""
            className="w-16 h-16 rounded-2xl bg-muted border-4 border-accent"
          />
          <div className="text-left">
            <p className="text-2xl font-bold">{winner.name}</p>
            <p className="text-accent font-mono font-bold text-xl">
              {winner.score.toLocaleString()} Punkte
            </p>
          </div>
        </motion.div>
      </motion.div>

      {/* Podium */}
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="flex items-end justify-center gap-4 mb-8"
      >
        {/* 2nd Place */}
        {podium[1] && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 140 }}
            transition={{ delay: 0.7, duration: 0.5 }}
            className="w-24 md:w-32"
          >
            <div className="h-full glass rounded-t-2xl flex flex-col items-center justify-end p-4">
              <img
                src={`https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(podium[1].avatarSeed)}&mood=happy`}
                alt=""
                className="w-10 h-10 rounded-lg bg-muted mb-2"
              />
              <p className="font-bold text-sm truncate w-full text-center">{podium[1].name}</p>
              <Medal className="w-6 h-6 text-gray-400 mt-1" />
              <p className="text-xl font-black text-gray-400">2</p>
            </div>
          </motion.div>
        )}

        {/* 1st Place */}
        {podium[0] && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 180 }}
            transition={{ delay: 0.6, duration: 0.5 }}
            className="w-28 md:w-36"
          >
            <div className="h-full glass rounded-t-2xl flex flex-col items-center justify-end p-4 border-accent/30 bg-accent/5 relative overflow-hidden">
              <Sparkles className="absolute top-2 right-2 w-5 h-5 text-accent animate-pulse" />
              <img
                src={`https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(podium[0].avatarSeed)}&mood=superHappy`}
                alt=""
                className="w-12 h-12 rounded-lg bg-muted border-2 border-accent mb-2"
              />
              <p className="font-bold truncate w-full text-center">{podium[0].name}</p>
              <Crown className="w-8 h-8 text-accent mt-1" />
              <p className="text-2xl font-black text-accent">1</p>
            </div>
          </motion.div>
        )}

        {/* 3rd Place */}
        {podium[2] && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 100 }}
            transition={{ delay: 0.8, duration: 0.5 }}
            className="w-24 md:w-32"
          >
            <div className="h-full glass rounded-t-2xl flex flex-col items-center justify-end p-4">
              <img
                src={`https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(podium[2].avatarSeed)}&mood=hopeful`}
                alt=""
                className="w-10 h-10 rounded-lg bg-muted mb-2"
              />
              <p className="font-bold text-sm truncate w-full text-center">{podium[2].name}</p>
              <Medal className="w-6 h-6 text-amber-700 mt-1" />
              <p className="text-xl font-black text-amber-700">3</p>
            </div>
          </motion.div>
        )}
      </motion.div>

      {/* Rest of Players */}
      {rest.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="w-full max-w-md space-y-2 mb-8"
        >
          {rest.map((player, index) => (
            <div
              key={player.playerId}
              className={`flex items-center gap-3 p-3 rounded-xl glass ${
                player.playerId === playerId ? 'ring-1 ring-primary' : ''
              }`}
            >
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center font-bold text-sm text-muted-foreground">
                {index + 4}
              </div>
              <img
                src={`https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(player.avatarSeed)}&mood=neutral`}
                alt=""
                className="w-8 h-8 rounded-lg bg-muted"
              />
              <span className="flex-1 font-medium truncate">{player.name}</span>
              <span className="font-mono font-bold text-muted-foreground">
                {player.score.toLocaleString()}
              </span>
            </div>
          ))}
        </motion.div>
      )}

      {/* Actions */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 1.2 }}
      >
        <Button
          onClick={handleLeave}
          variant="outline"
          className="h-14 px-8 text-lg font-bold"
        >
          <Home className="w-5 h-5 mr-2" />
          Zurück zum Start
        </Button>
      </motion.div>
    </motion.div>
  );
}
