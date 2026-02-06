'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket } from '@/hooks/useSocket';
import { getSocket } from '@/lib/socket';
import { useGameStore, useIsHost } from '@/store/gameStore';
import { useDevMode } from '@/hooks/useDevMode';
import { useAudio } from '@/hooks/useAudio';
import { Button } from '@/components/ui/button';
import { 
  Copy, 
  Check, 
  Crown, 
  Play,
  Users,
  LogOut,
  Wifi,
  Share2,
  Zap,
  HelpCircle,
  Minus,
  Plus,
  Gift,
  Percent,
  Trophy,
  Settings2,
  ChevronDown,
  Pencil,
  Dices,
} from 'lucide-react';
import { 
  AvatarCustomizer, 
  getAvatarUrlFromSeed, 
  getSavedAvatarOptions,
  optionsToSeed,
  saveAvatarOptions,
  type DylanAvatarOptions,
  DEFAULT_AVATAR_OPTIONS,
} from '@/components/game/AvatarCustomizer';
import { CustomGameConfigurator, RoundSequencePreview } from '@/components/game/CustomGameConfigurator';
import { 
  createDefaultCustomRounds, 
  type CustomRoundConfig,
  saveCustomGameConfig,
  loadCustomGameConfig,
} from '@/config/customGame.shared';

// ============================================
// PLAYER CARD
// ============================================

function PlayerCard({ 
  player, 
  index, 
  isCurrentPlayer,
  onReroll,
  onEdit,
}: { 
  player: { id: string; name: string; avatarSeed: string; isHost: boolean; isConnected: boolean };
  index: number;
  isCurrentPlayer: boolean;
  onReroll?: () => void;
  onEdit?: () => void;
}) {
  const avatarUrl = useMemo(() => getAvatarUrlFromSeed(player.avatarSeed), [player.avatarSeed]);
  const [isRerolling, setIsRerolling] = useState(false);

  const handleReroll = () => {
    if (!onReroll || isRerolling) return;
    setIsRerolling(true);
    onReroll();
    setTimeout(() => setIsRerolling(false), 600);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ delay: index * 0.05 }}
      className={`relative p-4 rounded-2xl transition-all ${
        isCurrentPlayer 
          ? 'bg-primary/5 ring-2 ring-primary/30' 
          : 'bg-muted/30 hover:bg-muted/50'
      }`}
    >
      {/* Host Badge */}
      {player.isHost && (
        <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center shadow-lg z-10">
          <Crown className="w-3.5 h-3.5 text-white" />
        </div>
      )}

      {/* Avatar */}
      <div className="relative w-14 h-14 mx-auto mb-2">
        <motion.div
          animate={isRerolling ? { rotate: 360 } : { rotate: 0 }}
          transition={isRerolling ? { duration: 0.5, ease: 'easeOut' } : {}}
        >
          <motion.img
            key={player.avatarSeed}
            src={avatarUrl}
            alt=""
            className="w-full h-full rounded-xl bg-muted"
            initial={isRerolling ? { scale: 0.8, opacity: 0 } : false}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          />
        </motion.div>
        
        {/* Edit/Reroll Buttons */}
        {isCurrentPlayer && (
          <div className="absolute -bottom-1 -right-1 flex gap-0.5">
            {onEdit && (
              <motion.button
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={onEdit}
                className="w-5 h-5 rounded-full bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center shadow"
              >
                <Pencil className="w-2.5 h-2.5" />
              </motion.button>
            )}
            {onReroll && (
              <motion.button
                initial={{ scale: 0 }}
                animate={{ scale: 1, transition: { delay: 0.05 } }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={handleReroll}
                disabled={isRerolling}
                className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow disabled:opacity-50"
              >
                <motion.div
                  animate={isRerolling ? { rotate: 360 } : {}}
                  transition={{ duration: 0.5, ease: 'linear' }}
                >
                  <Dices className="w-2.5 h-2.5" />
                </motion.div>
              </motion.button>
            )}
          </div>
        )}
      </div>

      {/* Name */}
      <p className="font-semibold text-sm text-center truncate">{player.name}</p>
      
      {/* Status */}
      <div className="flex items-center justify-center gap-1.5 mt-1">
        <div className={`w-1.5 h-1.5 rounded-full ${player.isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="text-xs text-muted-foreground">
          {isCurrentPlayer ? 'Du' : player.isConnected ? 'Online' : 'Offline'}
        </span>
      </div>
    </motion.div>
  );
}

// ============================================
// EMPTY SLOT
// ============================================

function EmptySlot({ index }: { index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.2 + index * 0.05 }}
      className="p-4 rounded-2xl border-2 border-dashed border-border/30 flex flex-col items-center justify-center"
    >
      <div className="w-14 h-14 rounded-xl bg-muted/20 flex items-center justify-center mb-2">
        <Users className="w-5 h-5 text-muted-foreground/30" />
      </div>
      <p className="text-xs text-muted-foreground/50">Wartet...</p>
    </motion.div>
  );
}

// ============================================
// SETTING CONTROL
// ============================================

function SettingControl({
  label,
  value,
  options,
  onChange,
  icon: Icon,
}: {
  label: string;
  value: number;
  options: number[];
  onChange: (value: number) => void;
  icon: React.ElementType;
}) {
  const currentIndex = options.indexOf(value);
  const canDecrease = currentIndex > 0;
  const canIncrease = currentIndex < options.length - 1;

  return (
    <div className="flex flex-col gap-2 p-3 rounded-xl bg-muted/30">
      {/* Label Row */}
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Icon className="w-3 h-3 sm:w-4 sm:h-4 text-primary" />
        </div>
        <span className="text-xs sm:text-sm font-medium">{label}</span>
      </div>

      {/* Controls Row */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => canDecrease && onChange(options[currentIndex - 1])}
          disabled={!canDecrease}
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
            canDecrease 
              ? 'bg-background hover:bg-muted text-foreground' 
              : 'text-muted-foreground/30 cursor-not-allowed'
          }`}
        >
          <Minus className="w-4 h-4" />
        </button>

        <span className="w-10 text-center text-xl font-bold text-primary">{value}</span>

        <button
          onClick={() => canIncrease && onChange(options[currentIndex + 1])}
          disabled={!canIncrease}
          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
            canIncrease 
              ? 'bg-background hover:bg-muted text-foreground' 
              : 'text-muted-foreground/30 cursor-not-allowed'
          }`}
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ============================================
// BONUS SETTINGS
// ============================================

function BonusSettings({
  bonusRoundChance,
  finalRoundAlwaysBonus,
  onBonusChanceChange,
  onFinalBonusChange,
}: {
  bonusRoundChance: number;
  finalRoundAlwaysBonus: boolean;
  onBonusChanceChange: (value: number) => void;
  onFinalBonusChange: (value: boolean) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const chanceOptions = [0, 10, 25, 50, 75, 100];
  const currentIndex = chanceOptions.indexOf(bonusRoundChance);

  return (
    <div className="rounded-xl bg-muted/30 overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <Gift className="w-4 h-4 text-amber-500" />
          </div>
          <span className="text-sm font-medium">Bonusrunden</span>
        </div>
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }}>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </motion.div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-3 pt-0 space-y-3">
              {/* Final Round Toggle */}
              <button
                onClick={() => onFinalBonusChange(!finalRoundAlwaysBonus)}
                className={`w-full flex items-center justify-between p-2 rounded-lg transition-colors ${
                  finalRoundAlwaysBonus ? 'bg-amber-500/10' : 'bg-background/50 hover:bg-background'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Trophy className={`w-4 h-4 ${finalRoundAlwaysBonus ? 'text-amber-500' : 'text-muted-foreground'}`} />
                  <span className="text-sm">Finale = Bonusrunde</span>
                </div>
                <div className={`w-10 h-6 rounded-full p-0.5 transition-colors ${
                  finalRoundAlwaysBonus ? 'bg-amber-500' : 'bg-muted'
                }`}>
                  <motion.div
                    className="w-5 h-5 rounded-full bg-white shadow"
                    animate={{ x: finalRoundAlwaysBonus ? 16 : 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                </div>
              </button>

              {/* Chance Control */}
              <div className="flex items-center justify-between p-2 rounded-lg bg-background/50">
                <div className="flex items-center gap-2">
                  <Percent className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">Zufällige Chance</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => currentIndex > 0 && onBonusChanceChange(chanceOptions[currentIndex - 1])}
                    disabled={currentIndex === 0}
                    className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className={`w-10 text-center font-bold ${bonusRoundChance > 0 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                    {bonusRoundChance}%
                  </span>
                  <button
                    onClick={() => currentIndex < chanceOptions.length - 1 && onBonusChanceChange(chanceOptions[currentIndex + 1])}
                    disabled={currentIndex === chanceOptions.length - 1}
                    className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================
// GAME MODE TOGGLE
// ============================================

function GameModeToggle({
  customMode,
  onChange,
}: {
  customMode: boolean;
  onChange: (isCustom: boolean) => void;
}) {
  return (
    <div className="flex p-1 bg-muted/30 rounded-xl">
      <button
        onClick={() => onChange(false)}
        className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
          !customMode 
            ? 'bg-primary text-primary-foreground shadow-sm' 
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <Zap className="w-4 h-4" />
        <span>Standard</span>
      </button>
      <button
        onClick={() => onChange(true)}
        className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
          customMode 
            ? 'bg-primary text-primary-foreground shadow-sm' 
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <Settings2 className="w-4 h-4" />
        <span>Eigenes Spiel</span>
      </button>
    </div>
  );
}

// ============================================
// LOBBY SCREEN
// ============================================

export function LobbyScreen() {
  const router = useRouter();
  const { startGame, updateSettings, leaveGame, updateAvatar } = useSocket();
  const room = useGameStore((s) => s.room);
  const playerId = useGameStore((s) => s.playerId);
  const isHost = useIsHost();
  const { isDevMode, activateDevMode } = useDevMode();
  const { playMusic } = useAudio();

  // Play lobby music when entering the lobby
  useEffect(() => {
    playMusic('lobby');
    // No cleanup — music continues until the next screen calls playMusic/stopMusic
  }, [playMusic]);
  
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devModeActivated, setDevModeActivated] = useState(false);
  const [showAvatarCustomizer, setShowAvatarCustomizer] = useState(false);
  const [showGameConfigurator, setShowGameConfigurator] = useState(false);
  
  // Randomize avatar handler
  const handleRandomizeAvatar = useCallback(() => {
    const randomOptions: DylanAvatarOptions = {
      hair: ['bangs', 'buns', 'flatTop', 'fluffy', 'longCurls', 'parting', 'plain', 'roundBob', 'shaggy', 'shortCurls', 'spiky', 'wavy'][Math.floor(Math.random() * 12)],
      hairColor: ['000000', '3d2314', '7b4b2a', 'a67c52', 'daa520', 'f0e68c', 'b22222', 'cd7f32', 'ff6347', 'ff69b4', 'ff1493', '9370db', '8b00ff', '4169e1', '40e0d0', '228b22', '32cd32', '808080', 'c0c0c0', 'f5f5f5'][Math.floor(Math.random() * 20)],
      skinColor: ['fce4d6', 'ffd6c0', 'e8c4a0', 'c9a06b', 'c26450', 'a67c52', '8d5524', '614335', '3a2a1d'][Math.floor(Math.random() * 9)],
      backgroundColor: ['transparent', 'ffffff', 'f0f0f0', 'd3d3d3', 'ff7f7f', 'ffdab9', 'ffd700', 'fff500', '98fb98', 'b6e3f4', '40e0d0', '87ceeb', 'add8e6', 'e6e6fa', 'c0aede', 'dda0dd', 'ffb6c1', 'ffd5dc', 'ffdfbf'][Math.floor(Math.random() * 19)],
      facialHair: Math.random() > 0.7 ? 'default' : '',
    };
    saveAvatarOptions(randomOptions);
    updateAvatar(optionsToSeed(randomOptions));
  }, [updateAvatar]);
  
  // Load saved custom game config when host enters lobby
  const hasLoadedSavedConfig = useRef(false);
  // Speichere die Custom-Rounds separat, damit sie beim Moduswechsel nicht verloren gehen
  const savedCustomRoundsRef = useRef<CustomRoundConfig[] | null>(null);
  
  useEffect(() => {
    if (!isHost || !room || hasLoadedSavedConfig.current) return;
    
    const savedConfig = loadCustomGameConfig();
    if (savedConfig) {
      hasLoadedSavedConfig.current = true;
      
      // Speichere die Custom-Rounds für späteren Zugriff
      if (savedConfig.customRounds && savedConfig.customRounds.length > 0) {
        savedCustomRoundsRef.current = savedConfig.customRounds;
      }
      
      // Wende die gespeicherte Konfiguration an
      updateSettings({
        customMode: savedConfig.customMode,
        customRounds: savedConfig.customRounds,
        questionsPerRound: savedConfig.questionsPerRound,
        maxRounds: savedConfig.maxRounds,
        bonusRoundChance: savedConfig.bonusRoundChance,
        finalRoundAlwaysBonus: savedConfig.finalRoundAlwaysBonus,
      });
    }
  }, [isHost, room, updateSettings]);
  
  // Aktualisiere savedCustomRoundsRef wenn Custom-Rounds geändert werden (nur im Custom-Modus)
  useEffect(() => {
    if (!isHost || !room) return;
    
    if (room.settings.customMode && room.settings.customRounds && room.settings.customRounds.length > 0) {
      savedCustomRoundsRef.current = room.settings.customRounds;
    }
  }, [isHost, room, room?.settings.customMode, room?.settings.customRounds]);
  
  // Save config whenever settings change (only for host)
  useEffect(() => {
    if (!isHost || !room) return;
    
    // Speichere die aktuelle Konfiguration
    // Verwende savedCustomRoundsRef wenn wir nicht im Custom-Modus sind, um die Konfiguration zu erhalten
    const roundsToSave = room.settings.customMode 
      ? (room.settings.customRounds ?? [])
      : (savedCustomRoundsRef.current ?? room.settings.customRounds ?? []);
    
    saveCustomGameConfig({
      customMode: room.settings.customMode ?? false,
      customRounds: roundsToSave,
      questionsPerRound: room.settings.questionsPerRound,
      maxRounds: room.settings.maxRounds,
      bonusRoundChance: room.settings.bonusRoundChance,
      finalRoundAlwaysBonus: room.settings.finalRoundAlwaysBonus,
    });
  }, [
    isHost,
    room,
    room?.settings.customMode,
    room?.settings.customRounds,
    room?.settings.questionsPerRound,
    room?.settings.maxRounds,
    room?.settings.bonusRoundChance,
    room?.settings.finalRoundAlwaysBonus,
  ]);
  
  // Dev mode listener
  const typedCharsRef = useRef('');
  
  useEffect(() => {
    if (!isHost || isDevMode) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      if (e.key.length === 1) {
        typedCharsRef.current += e.key.toLowerCase();
        if (typedCharsRef.current.length > 20) {
          typedCharsRef.current = typedCharsRef.current.slice(-20);
        }
        
        if (typedCharsRef.current.includes('clairobscur99')) {
          if (activateDevMode('clairobscur99')) {
            setDevModeActivated(true);
            typedCharsRef.current = '';
            
            const socket = getSocket();
            socket.emit('enable_dev_mode', {
              roomCode: room?.code,
              playerId: playerId,
              secretCode: 'clairobscur99',
            });
            
            setTimeout(() => setDevModeActivated(false), 3000);
          }
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isHost, isDevMode, activateDevMode, room?.code, playerId]);

  if (!room) return null;

  const copyCode = async () => {
    await navigator.clipboard.writeText(room.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyLink = async () => {
    const url = `${window.location.origin}/room/${room.code}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLeave = () => {
    leaveGame();
    router.push('/');
  };

  const handleStart = async () => {
    setStarting(true);
    setError(null);
    const result = await startGame();
    if (!result.success) {
      setError(result.error || 'Fehler');
    }
    // Welcome-TTS wird jetzt in page.tsx für ALLE Spieler abgespielt
    setStarting(false);
  };

  const canStart = room.players.length >= 1;
  
  // 4 slots on mobile, 8 on desktop - use media query
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const checkDesktop = () => setIsDesktop(window.innerWidth >= 768);
    checkDesktop();
    window.addEventListener('resize', checkDesktop);
    return () => window.removeEventListener('resize', checkDesktop);
  }, []);
  const maxSlots = isDesktop ? 8 : 4;
  const emptySlots = Math.max(0, maxSlots - room.players.length);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen flex flex-col"
    >
      {/* Dev Mode Toast */}
      <AnimatePresence>
        {devModeActivated && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] px-4 py-2 rounded-xl bg-amber-500 text-black font-bold shadow-xl flex items-center gap-2"
          >
            <span>🔧</span>
            <span>Dev Mode aktiviert!</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="p-4 md:p-6 border-b border-border/50">
        <div className="max-w-4xl mx-auto">
          {/* Room Code */}
          <button
            onClick={copyCode}
            className="group flex items-center gap-4 px-5 py-3 rounded-2xl bg-muted/30 hover:bg-muted/50 transition-colors mx-auto"
          >
            <div className="text-left">
              <span className="text-xs text-muted-foreground uppercase tracking-wider block">Room Code</span>
              <span className="text-2xl md:text-3xl font-mono font-black tracking-[0.2em] text-primary">
                {room.code}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              {copied ? (
                <Check className="w-5 h-5 text-green-500" />
              ) : (
                <Copy className="w-5 h-5 text-primary" />
              )}
            </div>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-4 md:p-6 flex flex-col md:justify-center">
        <div className="max-w-4xl mx-auto space-y-6 w-full">
          
          {/* Players Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">
                {room.players.length} Spieler
              </span>
              {room.players.length < 2 && (
                <span className="text-xs text-muted-foreground ml-auto">
                  2 empfohlen · Solo möglich
                </span>
              )}
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              <AnimatePresence mode="popLayout">
                {room.players.map((player, i) => (
                  <PlayerCard
                    key={player.id}
                    player={player}
                    index={i}
                    isCurrentPlayer={player.id === playerId}
                    onReroll={player.id === playerId ? handleRandomizeAvatar : undefined}
                    onEdit={player.id === playerId ? () => setShowAvatarCustomizer(true) : undefined}
                  />
                ))}
              </AnimatePresence>
              
              {Array.from({ length: emptySlots }).map((_, i) => (
                <EmptySlot key={`empty-${i}`} index={i} />
              ))}
            </div>
          </div>

          {/* Game Settings */}
          <div className="rounded-2xl bg-card/50 border border-border/50 p-4">
            {isHost ? (
              <div className="space-y-4">
                {/* Mode Toggle */}
                <GameModeToggle
                  customMode={room.settings.customMode ?? false}
                  onChange={(isCustom) => {
                    if (isCustom) {
                      // Verwende gespeicherte Rounds wenn vorhanden, sonst erstelle neue
                      const roundsToUse = savedCustomRoundsRef.current && savedCustomRoundsRef.current.length > 0
                        ? savedCustomRoundsRef.current
                        : createDefaultCustomRounds(room.settings.maxRounds);
                      updateSettings({ 
                        customMode: true, 
                        customRounds: roundsToUse,
                        maxRounds: roundsToUse.length,
                      });
                    } else {
                      updateSettings({ customMode: false });
                    }
                  }}
                />

                <AnimatePresence mode="wait">
                  {room.settings.customMode ? (
                    /* Custom Mode */
                    <motion.div
                      key="custom"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-3"
                    >
                      {/* Open Configurator */}
                      <button
                        onClick={() => setShowGameConfigurator(true)}
                        className="w-full p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">Rundenfolge</span>
                          <span className="text-xs text-primary font-medium flex items-center gap-1">
                            Bearbeiten
                            <Pencil className="w-3 h-3" />
                          </span>
                        </div>
                        <RoundSequencePreview 
                          rounds={room.settings.customRounds || []} 
                        />
                      </button>

                      {/* Questions per Round (quick setting) */}
                      <SettingControl
                        label="Fragen/Runde"
                        value={room.settings.questionsPerRound}
                        options={[3, 5, 7, 10]}
                        onChange={(value) => updateSettings({ questionsPerRound: value })}
                        icon={HelpCircle}
                      />
                    </motion.div>
                  ) : (
                    /* Standard Mode */
                    <motion.div
                      key="standard"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-3"
                    >
                      <div className="grid grid-cols-2 gap-3">
                        <SettingControl
                          label="Runden"
                          value={room.settings.maxRounds}
                          options={[3, 5, 7, 10]}
                          onChange={(value) => updateSettings({ maxRounds: value })}
                          icon={Zap}
                        />
                        <SettingControl
                          label="Fragen"
                          value={room.settings.questionsPerRound}
                          options={[3, 5, 7, 10]}
                          onChange={(value) => updateSettings({ questionsPerRound: value })}
                          icon={HelpCircle}
                        />
                      </div>

                      <BonusSettings
                        bonusRoundChance={room.settings.bonusRoundChance ?? 0}
                        finalRoundAlwaysBonus={room.settings.finalRoundAlwaysBonus ?? false}
                        onBonusChanceChange={(value) => updateSettings({ bonusRoundChance: value })}
                        onFinalBonusChange={(value) => updateSettings({ finalRoundAlwaysBonus: value })}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {error && (
                  <p className="text-destructive text-sm text-center">{error}</p>
                )}

                {/* Start Button */}
                <Button
                  onClick={handleStart}
                  disabled={!canStart || starting}
                  size="lg"
                  className="w-full h-14 text-lg font-bold bg-gradient-to-r from-primary to-cyan-400"
                >
                  <Play className="w-5 h-5 mr-2" />
                  {starting ? 'Startet...' : 'Spiel starten'}
                </Button>

                {!canStart && (
                  <p className="text-center text-muted-foreground text-sm">
                    Mindestens 2 Spieler benötigt
                  </p>
                )}
              </div>
            ) : (
              /* Non-Host View */
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Settings2 className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">
                    {room.settings.customMode ? 'Benutzerdefiniertes Spiel' : 'Spieleinstellungen'}
                  </span>
                </div>

                {room.settings.customMode ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Rundenfolge</span>
                      <span className="text-xs text-muted-foreground">
                        {(() => {
                          const rounds = room.settings.customRounds || [];
                          const questionCount = rounds.filter(r => r.type === 'question_round').length;
                          const bonusCount = rounds.filter(r => r.type !== 'question_round').length;
                          const parts = [];
                          if (questionCount > 0) parts.push(`${questionCount} Quiz`);
                          if (bonusCount > 0) parts.push(`${bonusCount} Bonus`);
                          return parts.join(', ');
                        })()}
                      </span>
                    </div>
                    <RoundSequencePreview rounds={room.settings.customRounds || []} />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-muted/30 text-center">
                      <span className="text-2xl font-bold text-primary">{room.settings.maxRounds}</span>
                      <p className="text-xs text-muted-foreground">Runden</p>
                    </div>
                    <div className="p-3 rounded-xl bg-muted/30 text-center">
                      <span className="text-2xl font-bold text-primary">{room.settings.questionsPerRound}</span>
                      <p className="text-xs text-muted-foreground">Fragen/Runde</p>
                    </div>
                  </div>
                )}

                {/* Waiting Indicator */}
                <div className="text-center py-6 rounded-xl bg-muted/30">
                  <div className="flex items-center justify-center gap-1 mb-2">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        className="w-2 h-2 rounded-full bg-primary"
                        animate={{ y: [0, -6, 0] }}
                        transition={{
                          duration: 0.6,
                          repeat: Infinity,
                          delay: i * 0.15,
                        }}
                      />
                    ))}
                  </div>
                  <span className="text-sm text-muted-foreground">Warte auf Host...</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="p-4 md:p-6 border-t border-border/50">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={copyLink}
            className="flex-1"
          >
            <Share2 className="w-4 h-4 mr-2" />
            Link teilen
          </Button>
          <Button
            variant="ghost"
            onClick={handleLeave}
            className="text-muted-foreground hover:text-foreground"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Verlassen
          </Button>
        </div>
      </div>

      {/* Modals */}
      <AvatarCustomizer
        open={showAvatarCustomizer}
        onOpenChange={setShowAvatarCustomizer}
        onSave={(options: DylanAvatarOptions) => {
          updateAvatar(optionsToSeed(options));
        }}
      />

      <CustomGameConfigurator
        open={showGameConfigurator}
        onOpenChange={setShowGameConfigurator}
        rounds={room.settings.customRounds ?? []}
        onChange={(newRounds) => updateSettings({ 
          customRounds: newRounds,
          maxRounds: newRounds.length,
        })}
        questionsPerRound={room.settings.questionsPerRound}
        onQuestionsPerRoundChange={(value) => updateSettings({ questionsPerRound: value })}
      />
    </motion.div>
  );
}
