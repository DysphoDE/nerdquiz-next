'use client';

import { motion } from 'framer-motion';
import { Crown, Medal, Trophy, Flame, ArrowRight, TrendingUp } from 'lucide-react';
import { useSocket } from '@/hooks/useSocket';
import { useGameStore, useIsHost, usePlayers } from '@/store/gameStore';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const RANK_STYLES = [
  { bg: 'bg-gradient-to-r from-yellow-500/30 to-yellow-600/10', border: 'border-yellow-500/50', icon: Crown, iconColor: 'text-yellow-500' },
  { bg: 'bg-gradient-to-r from-gray-400/30 to-gray-500/10', border: 'border-gray-400/50', icon: Medal, iconColor: 'text-gray-400' },
  { bg: 'bg-gradient-to-r from-amber-700/30 to-amber-800/10', border: 'border-amber-700/50', icon: Medal, iconColor: 'text-amber-700' },
];

export function ScoreboardScreen() {
  const { next } = useSocket();
  const { room } = useGameStore();
  const isHost = useIsHost();
  const unsortedPlayers = usePlayers();
  const players = [...unsortedPlayers].sort((a, b) => b.score - a.score);

  const handleNext = () => {
    if (!room || !isHost) return;
    next();
  };

  const isFinalRound = room && room.currentRound >= room.settings.maxRounds;

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen p-4 sm:p-6 flex flex-col"
    >
      <div className="max-w-3xl mx-auto w-full flex-1 flex flex-col">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-6 sm:py-8"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-4">
            <Trophy className="w-5 h-5 text-primary" />
            <span className="font-bold">Runde {room?.currentRound} / {room?.settings.maxRounds}</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent">
            Zwischenstand
          </h2>
        </motion.div>

        {/* Podium for Top 3 (Desktop) */}
        {players.length >= 3 && (
          <div className="hidden sm:flex justify-center items-end gap-4 mb-8 px-4">
            {/* 2nd Place */}
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex flex-col items-center"
            >
              <img
                src={`https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(players[1]?.avatarSeed || '')}&mood=happy`}
                alt=""
                className="w-16 h-16 rounded-full bg-muted mb-2 ring-4 ring-gray-400"
              />
              <p className="font-bold text-sm truncate max-w-[100px]">{players[1]?.name}</p>
              <div className="w-24 h-20 bg-gradient-to-t from-gray-500 to-gray-400 rounded-t-lg flex items-center justify-center mt-2">
                <span className="text-2xl font-black text-white">2</span>
              </div>
            </motion.div>

            {/* 1st Place */}
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="flex flex-col items-center"
            >
              <motion.div
                animate={{ y: [0, -5, 0] }}
                transition={{ repeat: Infinity, duration: 2 }}
              >
                <Crown className="w-8 h-8 text-yellow-500 mb-1" />
              </motion.div>
              <img
                src={`https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(players[0]?.avatarSeed || '')}&mood=superHappy`}
                alt=""
                className="w-20 h-20 rounded-full bg-muted mb-2 ring-4 ring-yellow-500"
              />
              <p className="font-bold truncate max-w-[120px]">{players[0]?.name}</p>
              <div className="w-28 h-28 bg-gradient-to-t from-yellow-600 to-yellow-500 rounded-t-lg flex items-center justify-center mt-2">
                <span className="text-3xl font-black text-white">1</span>
              </div>
            </motion.div>

            {/* 3rd Place */}
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="flex flex-col items-center"
            >
              <img
                src={`https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(players[2]?.avatarSeed || '')}&mood=hopeful`}
                alt=""
                className="w-14 h-14 rounded-full bg-muted mb-2 ring-4 ring-amber-700"
              />
              <p className="font-bold text-sm truncate max-w-[100px]">{players[2]?.name}</p>
              <div className="w-20 h-14 bg-gradient-to-t from-amber-800 to-amber-700 rounded-t-lg flex items-center justify-center mt-2">
                <span className="text-xl font-black text-white">3</span>
              </div>
            </motion.div>
          </div>
        )}

        {/* Full Rankings */}
        <div className="space-y-2 flex-1">
          {players.map((player, index) => {
            const rankStyle = RANK_STYLES[index];
            const RankIcon = rankStyle?.icon || TrendingUp;

            return (
              <motion.div
                key={player.id}
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + index * 0.1 }}
              >
                <Card
                  className={cn(
                    'glass p-4 flex items-center gap-4 transition-all',
                    rankStyle?.bg,
                    rankStyle?.border
                  )}
                >
                  {/* Rank Badge */}
                  <div
                    className={cn(
                      'w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl',
                      index === 0 && 'bg-yellow-500 text-black',
                      index === 1 && 'bg-gray-400 text-black',
                      index === 2 && 'bg-amber-700 text-white',
                      index > 2 && 'bg-muted text-muted-foreground'
                    )}
                  >
                    {index < 3 ? <RankIcon className="w-6 h-6" /> : index + 1}
                  </div>

                  {/* Avatar */}
                  <img
                    src={`https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(player.avatarSeed)}&mood=neutral`}
                    alt=""
                    className={cn(
                      'w-12 h-12 rounded-full bg-muted',
                      !player.isConnected && 'opacity-50'
                    )}
                  />

                  {/* Name & Streak */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-lg truncate">{player.name}</p>
                      {player.isHost && (
                        <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded">
                          Host
                        </span>
                      )}
                    </div>
                    {player.streak > 0 && (
                      <div className="flex items-center gap-1 text-orange-500 text-sm">
                        <Flame className="w-4 h-4" />
                        <span className="font-bold">{player.streak}er Streak</span>
                      </div>
                    )}
                  </div>

                  {/* Score */}
                  <div className="text-right">
                    <motion.p
                      key={player.score}
                      initial={{ scale: 1.2 }}
                      animate={{ scale: 1 }}
                      className="font-mono font-black text-2xl sm:text-3xl text-primary"
                    >
                      {player.score.toLocaleString()}
                    </motion.p>
                    <p className="text-xs text-muted-foreground">Punkte</p>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {/* Next Round Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="mt-8 text-center"
        >
          {isHost ? (
            <Button
              onClick={handleNext}
              className="btn-3d bg-primary hover:bg-primary/90 px-8 py-6 font-bold text-lg glow-primary"
            >
              {isFinalRound ? 'Endergebnis anzeigen' : 'Nächste Runde'}
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          ) : (
            <p className="text-muted-foreground animate-pulse">
              {isFinalRound ? 'Gleich kommt das Endergebnis...' : 'Warte auf Host...'}
            </p>
          )}
        </motion.div>
      </div>
    </motion.main>
  );
}
