'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Bug, 
  ChevronDown, 
  ChevronUp, 
  Vote, 
  CircleDot, 
  Crown, 
  Users, 
  Play,
  Zap,
  SkipForward,
  Dices,
  Swords,
  ListChecks,
  Infinity,
  Loader2,
} from 'lucide-react';
import { getSocket } from '@/lib/socket';
import { useGameStore } from '@/store/gameStore';
import { useDevMode } from '@/hooks/useDevMode';

// Category type for endless mode
interface DevCategory {
  id: string;
  slug: string;
  name: string;
  icon: string;
  _count?: { questions: number };
}

export function DevPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [categories, setCategories] = useState<DevCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [selectedEndlessCategory, setSelectedEndlessCategory] = useState<string>('');
  const [showEndlessDropdown, setShowEndlessDropdown] = useState(false);
  const room = useGameStore((s) => s.room);
  const playerId = useGameStore((s) => s.playerId);
  const { isDevMode } = useDevMode();

  // Don't render if dev mode is not enabled
  if (!isDevMode) return null;

  const socket = getSocket();
  const roomCode = room?.code;

  // Load categories when endless dropdown is opened
  useEffect(() => {
    if (showEndlessDropdown && categories.length === 0 && !loadingCategories) {
      setLoadingCategories(true);
      fetch('/api/admin/categories')
        .then(res => res.json())
        .then((data: DevCategory[]) => {
          setCategories(data.filter(c => (c._count?.questions || 0) > 0));
          if (data.length > 0) {
            setSelectedEndlessCategory(data[0].slug);
          }
        })
        .catch(err => console.error('Failed to load categories:', err))
        .finally(() => setLoadingCategories(false));
    }
  }, [showEndlessDropdown, categories.length, loadingCategories]);

  // Dev commands
  const devCommand = (command: string, params?: any) => {
    if (!roomCode || !playerId) return;
    console.log(`🔧 Dev command: ${command}`, params);
    socket.emit('dev_command', { roomCode, playerId, command, params });
  };

  const forceVoting = () => devCommand('force_category_mode', { mode: 'voting' });
  const forceWheel = () => devCommand('force_category_mode', { mode: 'wheel' });
  const forceLosersPick = () => devCommand('force_category_mode', { mode: 'losers_pick' });
  const forceDiceRoyale = () => devCommand('force_category_mode', { mode: 'dice_royale' });
  const forceRPSDuel = () => devCommand('force_category_mode', { mode: 'rps_duel' });
  const addBotPlayer = () => devCommand('add_bot');
  const skipToQuestion = () => devCommand('skip_to_question');
  const skipToEstimation = () => devCommand('skip_to_estimation');
  const skipToScoreboard = () => devCommand('skip_to_scoreboard');
  const skipToFinal = () => devCommand('skip_to_final');
  const setRandomScores = () => devCommand('randomize_scores');
  const startBonusRound = () => devCommand('start_bonus_round');
  const startEndlessRound = () => {
    if (!selectedEndlessCategory) return;
    devCommand('start_endless_round', { categoryId: selectedEndlessCategory });
    setShowEndlessDropdown(false);
  };

  if (!room) return null;

  return (
    <>
      {/* Toggle Button */}
      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 right-4 z-[100] p-3 rounded-full bg-yellow-500 text-black shadow-lg hover:bg-yellow-400 transition-colors"
        title="Dev Panel"
      >
        <Bug className="w-5 h-5" />
      </motion.button>

      {/* Panel - opens directly when button is clicked */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-20 right-4 z-[100] w-80 bg-zinc-900 border border-yellow-500/50 rounded-xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-yellow-500/20 border-b border-yellow-500/30">
              <div className="flex items-center gap-2">
                <Bug className="w-4 h-4 text-yellow-500" />
                <span className="font-bold text-yellow-500">Dev Panel</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-yellow-500/70">
                  {room.code} | {room.phase}
                </span>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="text-yellow-500 hover:text-yellow-300 transition-colors"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Content - always visible when panel is open */}
            <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
                    
                    {/* Current State */}
                    <div className="text-xs space-y-1 p-2 bg-zinc-800 rounded-lg">
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Phase:</span>
                        <span className="text-white font-mono">{room.phase}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Runde:</span>
                        <span className="text-white">{room.currentRound}/{room.settings.maxRounds}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Spieler:</span>
                        <span className="text-white">{room.players.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Kategorie-Modus:</span>
                        <span className="text-white font-mono">{room.categorySelectionMode || '-'}</span>
                      </div>
                    </div>

                    {/* Force Category Mode */}
                    <div>
                      <h4 className="text-xs text-zinc-400 mb-2 uppercase tracking-wider">
                        Kategorie-Modus erzwingen
                      </h4>
                      <div className="grid grid-cols-3 gap-2">
                        <DevButton onClick={forceVoting} icon={Vote} label="Voting" color="blue" />
                        <DevButton onClick={forceWheel} icon={CircleDot} label="Wheel" color="purple" />
                        <DevButton onClick={forceLosersPick} icon={Crown} label="Loser" color="amber" />
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <DevButton onClick={forceDiceRoyale} icon={Dices} label="Dice Royale" color="emerald" />
                        <DevButton onClick={forceRPSDuel} icon={Swords} label="RPS Duel" color="rose" />
                      </div>
                    </div>

                    {/* Players */}
                    <div>
                      <h4 className="text-xs text-zinc-400 mb-2 uppercase tracking-wider">
                        Spieler
                      </h4>
                      <div className="grid grid-cols-2 gap-2">
                        <DevButton onClick={addBotPlayer} icon={Users} label="+ Bot" color="green" />
                        <DevButton onClick={setRandomScores} icon={Zap} label="Rnd Scores" color="pink" />
                      </div>
                    </div>

                    {/* Skip to Phase */}
                    <div>
                      <h4 className="text-xs text-zinc-400 mb-2 uppercase tracking-wider">
                        Zur Phase springen
                      </h4>
                      <div className="grid grid-cols-2 gap-2">
                        <DevButton onClick={skipToQuestion} icon={Play} label="Frage" color="cyan" />
                        <DevButton onClick={skipToEstimation} icon={Play} label="Schätzung" color="orange" />
                        <DevButton onClick={skipToScoreboard} icon={SkipForward} label="Scoreboard" color="indigo" />
                        <DevButton onClick={skipToFinal} icon={SkipForward} label="Finale" color="rose" />
                      </div>
                    </div>

                    {/* Bonus Round */}
                    <div>
                      <h4 className="text-xs text-zinc-400 mb-2 uppercase tracking-wider">
                        Bonusrunde
                      </h4>
                      <div className="grid grid-cols-1 gap-2">
                        <DevButton onClick={startBonusRound} icon={ListChecks} label="📋 Sammel-Liste starten" color="amber" />
                      </div>
                    </div>

                    {/* Endless Round */}
                    <div>
                      <h4 className="text-xs text-zinc-400 mb-2 uppercase tracking-wider">
                        Endlosrunde (zum Testen)
                      </h4>
                      <div className="space-y-2">
                        {!showEndlessDropdown ? (
                          <button
                            onClick={() => setShowEndlessDropdown(true)}
                            className="w-full flex items-center justify-center gap-2 p-2 rounded-lg border transition-colors bg-violet-500/20 text-violet-400 hover:bg-violet-500/30 border-violet-500/30"
                          >
                            <Infinity className="w-4 h-4" />
                            <span className="text-[10px] font-medium">♾️ Endlosrunde starten</span>
                          </button>
                        ) : (
                          <div className="p-3 bg-zinc-800 rounded-lg space-y-3">
                            {loadingCategories ? (
                              <div className="flex items-center justify-center gap-2 py-2 text-zinc-400">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span className="text-xs">Lade Kategorien...</span>
                              </div>
                            ) : (
                              <>
                                <select
                                  value={selectedEndlessCategory}
                                  onChange={(e) => setSelectedEndlessCategory(e.target.value)}
                                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                                >
                                  {categories.map((cat) => (
                                    <option key={cat.id} value={cat.slug}>
                                      {cat.icon} {cat.name} ({cat._count?.questions || 0})
                                    </option>
                                  ))}
                                </select>
                                <div className="flex gap-2">
                                  <button
                                    onClick={startEndlessRound}
                                    disabled={!selectedEndlessCategory}
                                    className="flex-1 flex items-center justify-center gap-2 p-2 rounded-lg border transition-colors bg-violet-500/20 text-violet-400 hover:bg-violet-500/30 border-violet-500/30 disabled:opacity-50"
                                  >
                                    <Play className="w-4 h-4" />
                                    <span className="text-xs font-medium">Starten</span>
                                  </button>
                                  <button
                                    onClick={() => setShowEndlessDropdown(false)}
                                    className="px-3 py-2 rounded-lg border border-zinc-600 text-zinc-400 hover:bg-zinc-700 transition-colors text-xs"
                                  >
                                    Abbrechen
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Players List */}
                    <div>
                      <h4 className="text-xs text-zinc-400 mb-2 uppercase tracking-wider">
                        Spieler ({room.players.length})
                      </h4>
                      <div className="space-y-1">
                        {room.players.map((p) => (
                          <div 
                            key={p.id}
                            className={`flex items-center gap-2 p-2 rounded-lg text-xs ${
                              p.id === playerId ? 'bg-primary/20 border border-primary/30' : 'bg-zinc-800'
                            }`}
                          >
                            <img
                              src={`https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(p.avatarSeed)}&mood=neutral`}
                              alt=""
                              className="w-6 h-6 rounded-full"
                            />
                            <span className="flex-1 truncate">{p.name}</span>
                            <span className="text-zinc-400">{p.score} pts</span>
                            {p.isHost && <Crown className="w-3 h-3 text-amber-500" />}
                            {p.isConnected ? (
                              <div className="w-2 h-2 rounded-full bg-green-500" />
                            ) : (
                              <div className="w-2 h-2 rounded-full bg-red-500" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// Dev Button Component
function DevButton({ 
  onClick, 
  icon: Icon, 
  label, 
  color 
}: { 
  onClick: () => void; 
  icon: React.ElementType; 
  label: string; 
  color: string;
}) {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border-blue-500/30',
    purple: 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 border-purple-500/30',
    amber: 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border-amber-500/30',
    green: 'bg-green-500/20 text-green-400 hover:bg-green-500/30 border-green-500/30',
    pink: 'bg-pink-500/20 text-pink-400 hover:bg-pink-500/30 border-pink-500/30',
    cyan: 'bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 border-cyan-500/30',
    orange: 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 border-orange-500/30',
    indigo: 'bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 border-indigo-500/30',
    rose: 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 border-rose-500/30',
    emerald: 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border-emerald-500/30',
  };

  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-colors ${colorClasses[color]}`}
    >
      <Icon className="w-4 h-4" />
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}

