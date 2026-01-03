'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket } from '@/hooks/useSocket';
import { getSocket } from '@/lib/socket';
import { useGameStore, useIsHost } from '@/store/gameStore';
import { useDevMode } from '@/hooks/useDevMode';
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
  Clock,
  HelpCircle,
  Minus,
  Plus,
  Sparkles,
  Dices,
  Gift,
  Percent,
  Trophy,
  Settings2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

// Animated Avatar Component with idle animations
function AnimatedAvatar({ 
  seed, 
  index, 
  isCurrentPlayer,
  isHost,
  onReroll,
}: { 
  seed: string; 
  index: number;
  isCurrentPlayer: boolean;
  isHost: boolean;
  onReroll?: () => void;
}) {
  // Random but consistent animation parameters per avatar
  const animParams = useMemo(() => ({
    bounceDelay: index * 0.2,
    bounceDuration: 3 + Math.random() * 1, // Slower, smoother bounce
    rotateDuration: 4 + Math.random() * 2, // Independent rotation timing
  }), [index]);

  const [isRerolling, setIsRerolling] = useState(false);

  const handleReroll = () => {
    if (!onReroll || isRerolling) return;
    setIsRerolling(true);
    onReroll();
    // Reset after animation
    setTimeout(() => setIsRerolling(false), 600);
  };

  return (
    <div className="relative w-16 h-16 mx-auto mb-3 group">
      {/* Glow effect for current player */}
      {isCurrentPlayer && (
        <motion.div
          className="absolute inset-0 rounded-xl bg-primary/30 blur-xl"
          animate={{
            opacity: [0.3, 0.6, 0.3],
            scale: [1, 1.15, 1],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      )}
      
      {/* Avatar container with independent bounce and rotate animations */}
      <motion.div
        className="relative"
        animate={{
          y: [0, -6, 0], // Smooth up and down
        }}
        transition={{
          duration: animParams.bounceDuration,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: animParams.bounceDelay,
        }}
      >
        <motion.div
           animate={{
            rotate: isRerolling ? [0, 360] : [-2, 2, -2], // Spin on reroll, subtle rotation otherwise
          }}
          transition={isRerolling ? {
            duration: 0.5,
            ease: 'easeOut',
          } : {
            duration: animParams.rotateDuration,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: animParams.bounceDelay + 0.5, // Offset from bounce
          }}
        >
          {/* The actual avatar image */}
          <motion.img
            key={seed} // Re-render on seed change for animation
            src={`https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(seed)}&mood=happy`}
            alt=""
            className="w-16 h-16 rounded-xl bg-muted relative z-10"
            initial={isRerolling ? { scale: 0.8, opacity: 0 } : false}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          />
        </motion.div>
      </motion.div>

      {/* Reroll button - only for current player */}
      {isCurrentPlayer && onReroll && (
        <motion.button
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={handleReroll}
          disabled={isRerolling}
          className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg z-30 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Neuer Avatar"
        >
          <motion.div
            animate={isRerolling ? { rotate: 360 } : {}}
            transition={{ duration: 0.5, ease: 'linear' }}
          >
            <Dices className="w-3.5 h-3.5" />
          </motion.div>
        </motion.button>
      )}

      {/* Floating particles for host */}
      {isHost && (
        <>
          {[...Array(3)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1.5 h-1.5 rounded-full bg-accent"
              style={{
                left: `${20 + i * 25}%`,
                top: '-10%',
              }}
              animate={{
                y: [0, -12, 0],
                opacity: [0, 0.8, 0],
                scale: [0.5, 1, 0.5],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                delay: i * 0.4,
                ease: 'easeInOut',
              }}
            />
          ))}
        </>
      )}
    </div>
  );
}

// Empty slot with pulse animation
function EmptySlot({ index }: { index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.3 + index * 0.1 }}
      className="p-4 rounded-2xl border-2 border-dashed border-border/50 text-center"
    >
      <motion.div 
        className="w-16 h-16 mx-auto mb-3 rounded-xl bg-muted/20 flex items-center justify-center"
        animate={{
          opacity: [0.3, 0.6, 0.3],
          scale: [0.95, 1, 0.95],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          delay: index * 0.2,
        }}
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
        >
          <Users className="w-6 h-6 text-muted-foreground/50" />
        </motion.div>
      </motion.div>
      <motion.p 
        className="text-sm text-muted-foreground/50"
        animate={{ opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      >
        Wartet...
      </motion.p>
    </motion.div>
  );
}

// Setting control with +/- buttons
function SettingControl({
  label,
  value,
  options,
  onChange,
  icon: Icon,
  description,
}: {
  label: string;
  value: number;
  options: number[];
  onChange: (value: number) => void;
  icon: React.ElementType;
  description: string;
}) {
  const currentIndex = options.indexOf(value);
  const canDecrease = currentIndex > 0;
  const canIncrease = currentIndex < options.length - 1;

  const handleDecrease = () => {
    if (canDecrease) {
      onChange(options[currentIndex - 1]);
    }
  };

  const handleIncrease = () => {
    if (canIncrease) {
      onChange(options[currentIndex + 1]);
    }
  };

  return (
    <motion.div 
      className="glass rounded-xl p-4 relative overflow-hidden group"
      whileHover={{ scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      {/* Subtle gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Icon className="w-4 h-4 text-primary" />
            </div>
            <span className="font-semibold text-sm">{label}</span>
          </div>
        </div>

        {/* Control row */}
        <div className="flex items-center justify-between gap-2">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={handleDecrease}
            disabled={!canDecrease}
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
              canDecrease 
                ? 'bg-muted hover:bg-muted/80 text-foreground' 
                : 'bg-muted/30 text-muted-foreground/30 cursor-not-allowed'
            }`}
          >
            <Minus className="w-4 h-4" />
          </motion.button>

          <motion.div 
            className="flex-1 text-center"
            key={value}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          >
            <span className="text-3xl font-black text-primary">{value}</span>
          </motion.div>

          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={handleIncrease}
            disabled={!canIncrease}
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
              canIncrease 
                ? 'bg-muted hover:bg-muted/80 text-foreground' 
                : 'bg-muted/30 text-muted-foreground/30 cursor-not-allowed'
            }`}
          >
            <Plus className="w-4 h-4" />
          </motion.button>
        </div>

        {/* Description */}
        <p className="text-xs text-muted-foreground mt-2 text-center">{description}</p>
      </div>
    </motion.div>
  );
}

// Toggle control for boolean settings
function ToggleControl({
  label,
  value,
  onChange,
  icon: Icon,
  description,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  icon: React.ElementType;
  description: string;
}) {
  return (
    <motion.button
      onClick={() => onChange(!value)}
      className={`glass rounded-xl p-4 relative overflow-hidden group text-left w-full transition-all ${
        value ? 'ring-2 ring-primary/50 bg-primary/5' : ''
      }`}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          }`}>
            <Icon className="w-4 h-4" />
          </div>
          <div>
            <span className="font-semibold text-sm block">{label}</span>
            <span className="text-xs text-muted-foreground">{description}</span>
          </div>
        </div>
        
        {/* Toggle Switch */}
        <div className={`w-12 h-7 rounded-full p-1 transition-colors ${
          value ? 'bg-primary' : 'bg-muted'
        }`}>
          <motion.div
            className="w-5 h-5 rounded-full bg-white shadow-sm"
            animate={{ x: value ? 20 : 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          />
        </div>
      </div>
    </motion.button>
  );
}

// Percentage control for bonus round chance
function PercentControl({
  label,
  value,
  onChange,
  icon: Icon,
  description,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  icon: React.ElementType;
  description: string;
}) {
  const options = [0, 10, 25, 50, 75, 100];
  const currentIndex = options.indexOf(value);
  const canDecrease = currentIndex > 0;
  const canIncrease = currentIndex < options.length - 1;

  return (
    <motion.div 
      className="glass rounded-xl p-4 relative overflow-hidden group"
      whileHover={{ scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
          value > 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
        }`}>
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <span className="font-semibold text-sm block">{label}</span>
          <span className="text-xs text-muted-foreground">{description}</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => canDecrease && onChange(options[currentIndex - 1])}
          disabled={!canDecrease}
          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
            canDecrease 
              ? 'bg-muted hover:bg-muted/80 text-foreground' 
              : 'bg-muted/30 text-muted-foreground/30 cursor-not-allowed'
          }`}
        >
          <Minus className="w-4 h-4" />
        </motion.button>

        <motion.div 
          className="flex-1 text-center"
          key={value}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        >
          <span className={`text-2xl font-black ${value > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
            {value}%
          </span>
        </motion.div>

        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => canIncrease && onChange(options[currentIndex + 1])}
          disabled={!canIncrease}
          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
            canIncrease 
              ? 'bg-muted hover:bg-muted/80 text-foreground' 
              : 'bg-muted/30 text-muted-foreground/30 cursor-not-allowed'
          }`}
        >
          <Plus className="w-4 h-4" />
        </motion.button>
      </div>
    </motion.div>
  );
}

// Game summary based on settings
function GameSummary({ 
  rounds, 
  questionsPerRound,
  bonusRoundChance,
  finalRoundAlwaysBonus,
}: { 
  rounds: number; 
  questionsPerRound: number;
  bonusRoundChance: number;
  finalRoundAlwaysBonus: boolean;
}) {
  const totalQuestions = rounds * questionsPerRound;
  const estimatedMinutes = Math.round(totalQuestions * 0.5); // ~30s per question
  const hasBonusRounds = bonusRoundChance > 0 || finalRoundAlwaysBonus;

  return (
    <motion.div 
      className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <div className="flex items-center gap-1.5">
        <HelpCircle className="w-3.5 h-3.5" />
        <span>{totalQuestions} Fragen</span>
      </div>
      <div className="w-1 h-1 rounded-full bg-muted-foreground/30" />
      <div className="flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5" />
        <span>~{estimatedMinutes} Min</span>
      </div>
      {hasBonusRounds && (
        <>
          <div className="w-1 h-1 rounded-full bg-muted-foreground/30" />
          <div className="flex items-center gap-1.5 text-primary">
            <Gift className="w-3.5 h-3.5" />
            <span>Bonusrunden aktiv</span>
          </div>
        </>
      )}
    </motion.div>
  );
}

export function LobbyScreen() {
  const router = useRouter();
  const { startGame, updateSettings, leaveGame, rerollAvatar } = useSocket();
  const room = useGameStore((s) => s.room);
  const playerId = useGameStore((s) => s.playerId);
  const isHost = useIsHost();
  const { isDevMode, activateDevMode } = useDevMode();
  
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [devModeActivated, setDevModeActivated] = useState(false);
  
  // Secret code listener for dev mode activation
  const typedCharsRef = useRef('');
  
  useEffect(() => {
    // Only listen for secret code if host and not already in dev mode
    if (!isHost || isDevMode) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      // Add character to buffer
      if (e.key.length === 1) {
        typedCharsRef.current += e.key.toLowerCase();
        
        // Keep only last 20 characters
        if (typedCharsRef.current.length > 20) {
          typedCharsRef.current = typedCharsRef.current.slice(-20);
        }
        
        // Check if secret code was typed
        if (typedCharsRef.current.includes('clairobscur99')) {
          if (activateDevMode('clairobscur99')) {
            setDevModeActivated(true);
            typedCharsRef.current = '';
            
            // Notify the server to enable dev commands for this room
            const socket = getSocket();
            socket.emit('enable_dev_mode', {
              roomCode: room?.code,
              playerId: playerId,
              secretCode: 'clairobscur99',
            });
            
            // Hide notification after 3 seconds
            setTimeout(() => setDevModeActivated(false), 3000);
          }
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isHost, isDevMode, activateDevMode]);

  if (!room) return null;

  const copyCode = async () => {
    await navigator.clipboard.writeText(room.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyLink = async () => {
    const url = `${window.location.origin}/room/${room.code}`;
    await navigator.clipboard.writeText(url);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
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
    setStarting(false);
  };

  const canStart = room.players.length >= 1; // 1 for testing, normally 2

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen flex flex-col p-4 md:p-8 relative overflow-hidden"
    >
      {/* Dev Mode Activation Toast */}
      <AnimatePresence>
        {devModeActivated && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] px-6 py-3 rounded-xl bg-yellow-500 text-black font-bold shadow-2xl flex items-center gap-2"
          >
            <span className="text-lg">🔧</span>
            <span>Dev Mode aktiviert!</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Animated background particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 rounded-full bg-primary/20"
            style={{
              left: `${10 + i * 15}%`,
              top: `${20 + (i % 3) * 25}%`,
            }}
            animate={{
              y: [0, -30, 0],
              x: [0, 10, 0],
              opacity: [0.2, 0.5, 0.2],
              scale: [1, 1.5, 1],
            }}
            transition={{
              duration: 4 + i * 0.5,
              repeat: Infinity,
              delay: i * 0.7,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>

      {/* Header */}
      <div className="text-center py-6 relative z-10">
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4"
        >
          <Sparkles className="w-4 h-4" />
          <span>Runde {room.currentRound || 0} von {room.settings.maxRounds}</span>
        </motion.div>

        <motion.h1
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="text-3xl md:text-4xl font-black mb-6"
        >
          Warteraum
        </motion.h1>

        {/* Room Code with enhanced styling */}
        <motion.button
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={copyCode}
          className="relative inline-flex flex-col items-center gap-2 px-8 py-5 rounded-2xl glass hover:bg-muted/50 transition-all group overflow-hidden"
        >
          {/* Shine effect on hover */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"
          />
          
          <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium relative z-10">
            Room Code
          </span>
          <div className="flex items-center gap-3 relative z-10">
            <motion.span 
              className="text-4xl md:text-5xl font-mono font-black tracking-[0.3em] text-primary"
              animate={copied ? { scale: [1, 1.1, 1] } : {}}
              transition={{ duration: 0.3 }}
            >
              {room.code}
            </motion.span>
            <AnimatePresence mode="wait">
              {copied ? (
                <motion.div
                  key="check"
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0, rotate: 180 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                >
                  <Check className="w-6 h-6 text-green-500" />
                </motion.div>
              ) : (
                <motion.div
                  key="copy"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                >
                  <Copy className="w-6 h-6 text-muted-foreground group-hover:text-foreground transition-colors" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          {/* Copy feedback text */}
          <AnimatePresence>
            {copied && (
              <motion.span
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="text-xs text-green-500 font-medium"
              >
                Kopiert! ✓
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>

      {/* Players Grid */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="flex-1 max-w-4xl mx-auto w-full relative z-10"
      >
        <div className="flex items-center justify-center gap-2 mb-6 text-muted-foreground">
          <Users className="w-5 h-5" />
          <span className="font-medium">{room.players.length} Spieler</span>
          {room.players.length < 2 && (
            <motion.span 
              className="text-xs text-amber-500 ml-2"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              (mind. 2 zum Starten)
            </motion.span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          <AnimatePresence mode="popLayout">
            {room.players.map((player, i) => (
              <motion.div
                key={player.id}
                layout
                initial={{ scale: 0, rotate: -10, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                exit={{ scale: 0, rotate: 10, opacity: 0 }}
                transition={{ 
                  type: 'spring', 
                  stiffness: 500, 
                  damping: 30,
                  delay: 0.05 * i 
                }}
                className={`relative p-4 rounded-2xl glass text-center ${
                  player.id === playerId ? 'ring-2 ring-primary shadow-lg shadow-primary/20' : ''
                }`}
              >
                {/* Host crown with animation */}
                {player.isHost && (
                  <motion.div 
                    className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-accent flex items-center justify-center z-20"
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 20, delay: 0.2 }}
                  >
                    <motion.div
                      animate={{ rotate: [0, -10, 10, 0] }}
                      transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                    >
                      <Crown className="w-4 h-4 text-accent-foreground" />
                    </motion.div>
                  </motion.div>
                )}

                {/* Animated Avatar */}
                <AnimatedAvatar 
                  seed={player.avatarSeed}
                  index={i}
                  isCurrentPlayer={player.id === playerId}
                  isHost={player.isHost}
                  onReroll={player.id === playerId ? rerollAvatar : undefined}
                />

                <p className="font-bold truncate">{player.name}</p>
                
                <div className="flex items-center justify-center gap-1.5 mt-1.5">
                  <motion.div
                    animate={player.isConnected ? {
                      scale: [1, 1.2, 1],
                      opacity: [0.7, 1, 0.7],
                    } : {}}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Wifi className={`w-3 h-3 ${player.isConnected ? 'text-green-500' : 'text-red-500'}`} />
                  </motion.div>
                  <span className="text-xs text-muted-foreground">
                    {player.id === playerId ? 'Du' : player.isConnected ? 'Online' : 'Offline'}
                  </span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Empty slots with animation */}
          {Array.from({ length: Math.max(0, 4 - room.players.length) }).map((_, i) => (
            <EmptySlot key={`empty-${i}`} index={i} />
          ))}
        </div>
      </motion.div>

      {/* Host Controls */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="max-w-2xl mx-auto w-full pt-8 relative z-10"
      >
        {isHost ? (
          <div className="space-y-5">
            {/* Basic Settings */}
            <div className="grid grid-cols-2 gap-4">
              <SettingControl
                label="Runden"
                value={room.settings.maxRounds}
                options={[3, 5, 7, 10]}
                onChange={(value) => updateSettings({ maxRounds: value })}
                icon={Zap}
                description="Kategorie-Auswahlen"
              />

              <SettingControl
                label="Fragen"
                value={room.settings.questionsPerRound}
                options={[3, 5, 7, 10]}
                onChange={(value) => updateSettings({ questionsPerRound: value })}
                icon={HelpCircle}
                description="Pro Runde"
              />
            </div>

            {/* Advanced Settings Toggle */}
            <motion.button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
            >
              <Settings2 className="w-4 h-4" />
              <span>Erweiterte Einstellungen</span>
              <motion.div
                animate={{ rotate: showAdvanced ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown className="w-4 h-4" />
              </motion.div>
            </motion.button>

            {/* Advanced Settings Panel */}
            <AnimatePresence>
              {showAdvanced && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-4 overflow-hidden"
                >
                  {/* Bonusrunden-Einstellungen */}
                  <div className="glass rounded-xl p-4 space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                      <Gift className="w-4 h-4" />
                      <span>Bonusrunden</span>
                    </div>
                    
                    <ToggleControl
                      label="Finale = Bonusrunde"
                      value={room.settings.finalRoundAlwaysBonus ?? false}
                      onChange={(value) => updateSettings({ finalRoundAlwaysBonus: value })}
                      icon={Trophy}
                      description="Letzte Runde immer als Bonusrunde"
                    />

                    <PercentControl
                      label="Zufällige Bonusrunden"
                      value={room.settings.bonusRoundChance ?? 0}
                      onChange={(value) => updateSettings({ bonusRoundChance: value })}
                      icon={Percent}
                      description="Chance pro Runde"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Game Summary */}
            <GameSummary 
              rounds={room.settings.maxRounds} 
              questionsPerRound={room.settings.questionsPerRound}
              bonusRoundChance={room.settings.bonusRoundChance ?? 0}
              finalRoundAlwaysBonus={room.settings.finalRoundAlwaysBonus ?? false}
            />

            {error && (
              <motion.p 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-destructive text-sm text-center"
              >
                {error}
              </motion.p>
            )}

            {/* Start Button with enhanced animation */}
            <motion.div
              whileHover={{ scale: canStart ? 1.02 : 1 }}
              whileTap={{ scale: canStart ? 0.98 : 1 }}
            >
              <Button
                onClick={handleStart}
                disabled={!canStart || starting}
                className="w-full h-16 text-xl font-bold bg-gradient-to-r from-primary to-cyan-400 glow-primary disabled:opacity-50 relative overflow-hidden group"
              >
                {/* Shine effect */}
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full"
                  animate={!starting && canStart ? { translateX: ['−100%', '100%'] } : {}}
                  transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                />
                
                <motion.div
                  className="relative z-10 flex items-center justify-center"
                  animate={starting ? { opacity: [1, 0.5, 1] } : {}}
                  transition={{ duration: 0.8, repeat: Infinity }}
                >
                  <Play className="w-6 h-6 mr-2" />
                  {starting ? 'Startet...' : 'Spiel starten'}
                </motion.div>
              </Button>
            </motion.div>

            {!canStart && (
              <motion.p 
                className="text-center text-muted-foreground text-sm"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                Mindestens 2 Spieler benötigt
              </motion.p>
            )}
          </div>
        ) : (
          <motion.div 
            className="space-y-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {/* Current Settings Display */}
            <div className="glass rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-4">
                <Settings2 className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-muted-foreground">Aktuelle Einstellungen</span>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                {/* Rounds */}
                <div className="glass rounded-xl p-3 text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <Zap className="w-4 h-4 text-primary" />
                    <span className="text-xs text-muted-foreground">Runden</span>
                  </div>
                  <motion.span 
                    key={room.settings.maxRounds}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-2xl font-black text-primary"
                  >
                    {room.settings.maxRounds}
                  </motion.span>
                </div>
                
                {/* Questions per Round */}
                <div className="glass rounded-xl p-3 text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <HelpCircle className="w-4 h-4 text-primary" />
                    <span className="text-xs text-muted-foreground">Fragen/Runde</span>
                  </div>
                  <motion.span 
                    key={room.settings.questionsPerRound}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-2xl font-black text-primary"
                  >
                    {room.settings.questionsPerRound}
                  </motion.span>
                </div>
              </div>
              
              {/* Bonus Round Settings */}
              {(room.settings.finalRoundAlwaysBonus || (room.settings.bonusRoundChance ?? 0) > 0) && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-3 pt-3 border-t border-border/50"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Gift className="w-4 h-4 text-amber-500" />
                    <span className="text-xs text-amber-500 font-semibold">Bonusrunden</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {room.settings.finalRoundAlwaysBonus && (
                      <motion.span 
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="text-xs px-2 py-1 rounded-full bg-amber-500/20 text-amber-400 flex items-center gap-1"
                      >
                        <Trophy className="w-3 h-3" />
                        Finale = Bonus
                      </motion.span>
                    )}
                    {(room.settings.bonusRoundChance ?? 0) > 0 && (
                      <motion.span 
                        key={room.settings.bonusRoundChance}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="text-xs px-2 py-1 rounded-full bg-amber-500/20 text-amber-400 flex items-center gap-1"
                      >
                        <Percent className="w-3 h-3" />
                        {room.settings.bonusRoundChance}% Chance
                      </motion.span>
                    )}
                  </div>
                </motion.div>
              )}
            </div>
            
            {/* Waiting indicator */}
            <div className="text-center py-4 glass rounded-2xl relative overflow-hidden">
              {/* Animated background gradient */}
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-primary/5 via-secondary/5 to-primary/5"
                animate={{
                  backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
                }}
                transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
                style={{ backgroundSize: '200% 100%' }}
              />
              
              <div className="relative z-10 inline-flex items-center gap-3 text-muted-foreground">
                <motion.div
                  className="flex gap-1"
                >
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="w-2 h-2 rounded-full bg-primary"
                      animate={{ y: [0, -8, 0] }}
                      transition={{
                        duration: 0.6,
                        repeat: Infinity,
                        delay: i * 0.15,
                      }}
                    />
                  ))}
                </motion.div>
                <span>Warte auf Host...</span>
              </div>
            </div>
          </motion.div>
        )}

        {/* Share Link Button */}
        <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
          <Button
            variant="outline"
            onClick={copyLink}
            className="w-full mt-4 relative overflow-hidden group"
          >
            <AnimatePresence mode="wait">
              {linkCopied ? (
                <motion.span
                  key="copied"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex items-center text-green-500"
                >
                  <Check className="w-4 h-4 mr-2" />
                  Link kopiert!
                </motion.span>
              ) : (
                <motion.span
                  key="share"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex items-center"
                >
                  <Share2 className="w-4 h-4 mr-2" />
                  Einladungslink teilen
                </motion.span>
              )}
            </AnimatePresence>
          </Button>
        </motion.div>

        {/* Leave Button */}
        <Button
          variant="ghost"
          onClick={handleLeave}
          className="w-full mt-2 text-muted-foreground hover:text-foreground"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Spiel verlassen
        </Button>
      </motion.div>
    </motion.div>
  );
}
