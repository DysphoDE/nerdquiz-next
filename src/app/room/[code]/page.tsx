'use client';

import { useEffect, useLayoutEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { useSocket } from '@/hooks/useSocket';
import { useGameStore } from '@/store/gameStore';
import { loadSession, hasSessionForRoom, clearSession } from '@/lib/session';
import { PLAYER_VALIDATION } from '@/config/constants';
import { DevPanel } from '@/components/dev/DevPanel';
import { QuestionDebugPanel } from '@/components/dev/QuestionDebugPanel';
import { AudioControls } from '@/components/ui/AudioControls';
import { useAudioInit, useAudio } from '@/hooks/useAudio';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  LobbyScreen,
  RoundAnnouncementScreen,
  VotingScreen,
  CategoryWheelScreen,
  LosersPickScreen,
  DiceRoyaleScreen,
  RPSDuelScreen,
  QuestionScreen,
  EstimationScreen,
  EstimationRevealScreen,
  ScoreboardScreen,
  FinalScreen,
  BonusRoundScreen,
} from '@/components/screens';
import { Loader2, ArrowRight, ArrowLeft, Users, AlertCircle, Zap, Swords } from 'lucide-react';

type ConnectionState = 'loading' | 'reconnecting' | 'join_form' | 'connected' | 'error';

// ============================================
// GAME START OVERLAY - Fullscreen "NerdBattle" Animation
// ============================================

function GameStartOverlay({ onComplete, ttsPromise }: { onComplete: () => void; ttsPromise?: Promise<void> }) {
  const [phase, setPhase] = useState<'enter' | 'title' | 'subtitle' | 'hold' | 'flash' | 'exit'>('enter');
  const [animationMinReached, setAnimationMinReached] = useState(false);
  const [ttsFinished, setTtsFinished] = useState(false);
  const hasExited = useRef(false);

  // Track when TTS finishes
  useEffect(() => {
    if (!ttsPromise) {
      setTtsFinished(true);
      return;
    }
    ttsPromise.then(() => setTtsFinished(true)).catch(() => setTtsFinished(true));
  }, [ttsPromise]);

  // Animation phases - extended timeline for a more dramatic reveal
  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase('title'), 300),
      setTimeout(() => setPhase('subtitle'), 1000),
      setTimeout(() => setPhase('hold'), 2200),
      setTimeout(() => setAnimationMinReached(true), 3500),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  // Exit when both animation minimum and TTS are done
  useEffect(() => {
    if (animationMinReached && ttsFinished && !hasExited.current) {
      hasExited.current = true;
      setPhase('flash');
      const t1 = setTimeout(() => setPhase('exit'), 400);
      const t2 = setTimeout(() => onComplete(), 900);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [animationMinReached, ttsFinished, onComplete]);

  const isHolding = phase === 'hold';
  const isVisible = phase !== 'exit';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="min-h-screen flex items-center justify-center overflow-hidden relative"
      style={{ background: 'radial-gradient(ellipse at center, #0a0a1a 0%, #000000 100%)' }}
    >
      {/* Animated background particles */}
      <div className="absolute inset-0 overflow-hidden">
        {Array.from({ length: 30 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              left: `${5 + (i * 3.1) % 90}%`,
              top: `${15 + (i * 2.9) % 70}%`,
              width: `${2 + (i % 3)}px`,
              height: `${2 + (i % 3)}px`,
              background: ['#06b6d4', '#10b981', '#f59e0b', '#14b8a6', '#22d3ee', '#a78bfa'][i % 6],
            }}
            initial={{ opacity: 0, scale: 0 }}
            animate={{
              opacity: [0, 0.8, 0],
              scale: [0, 2, 0],
              y: [0, -100 - (i % 5) * 40],
              x: [0, ((i % 5) - 2) * 30],
            }}
            transition={{
              duration: 2 + (i % 4) * 0.5,
              delay: 0.1 + (i % 10) * 0.2,
              ease: 'easeOut',
              repeat: isHolding ? Infinity : 0,
              repeatDelay: 1,
            }}
          />
        ))}
      </div>

      {/* Sweeping energy lines */}
      <AnimatePresence>
        {isVisible && phase !== 'enter' && (
          <>
            <motion.div
              className="absolute left-0 top-1/2 -translate-y-1/2 w-2/5 h-[2px]"
              style={{ background: 'linear-gradient(90deg, transparent, #10b981, transparent)' }}
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: [0, 1, 0.5] }}
              exit={{ opacity: 0, scaleX: 0 }}
              transition={{ duration: 0.6 }}
            />
            <motion.div
              className="absolute right-0 top-1/2 -translate-y-1/2 w-2/5 h-[2px]"
              style={{ background: 'linear-gradient(270deg, transparent, #06b6d4, transparent)' }}
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: [0, 1, 0.5] }}
              exit={{ opacity: 0, scaleX: 0 }}
              transition={{ duration: 0.6 }}
            />
            {/* Vertical accent lines */}
            <motion.div
              className="absolute top-0 left-1/2 -translate-x-1/2 w-[1px] h-1/3"
              style={{ background: 'linear-gradient(180deg, transparent, rgba(16,185,129,0.4), transparent)' }}
              initial={{ scaleY: 0, opacity: 0 }}
              animate={{ scaleY: 1, opacity: 0.6 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
            />
            <motion.div
              className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[1px] h-1/3"
              style={{ background: 'linear-gradient(0deg, transparent, rgba(6,182,212,0.4), transparent)' }}
              initial={{ scaleY: 0, opacity: 0 }}
              animate={{ scaleY: 1, opacity: 0.6 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
            />
          </>
        )}
      </AnimatePresence>

      {/* Central glow - pulses during hold phase */}
      <motion.div
        className="absolute w-72 h-72 md:w-96 md:h-96 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(16,185,129,0.25) 0%, rgba(6,182,212,0.12) 40%, transparent 70%)',
          filter: 'blur(50px)',
        }}
        animate={{
          scale: phase === 'flash' ? [1, 4] : [1, 1.4, 1],
          opacity: phase === 'flash' ? [0.6, 0] : [0.3, 0.7, 0.3],
        }}
        transition={{
          duration: phase === 'flash' ? 0.4 : 2,
          repeat: phase === 'flash' ? 0 : Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Flash overlay */}
      <AnimatePresence>
        {phase === 'flash' && (
          <motion.div
            className="absolute inset-0 bg-white z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.8, 0] }}
            transition={{ duration: 0.5 }}
          />
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="relative z-20 text-center">
        {/* Icon */}
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={
            phase === 'exit'
              ? { scale: 0, rotate: 180, opacity: 0 }
              : { scale: 1, rotate: 0, opacity: 1 }
          }
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          className="mb-6 flex justify-center"
        >
          <motion.div
            className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-br from-emerald-500 via-cyan-500 to-teal-500 flex items-center justify-center shadow-2xl shadow-emerald-500/30"
            animate={isHolding ? { rotate: [0, 5, -5, 0] } : {}}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Swords className="w-8 h-8 md:w-10 md:h-10 text-white" />
          </motion.div>
        </motion.div>

        {/* Title: NERD */}
        <motion.div
          initial={{ x: -60, opacity: 0, scale: 0.7 }}
          animate={
            phase === 'exit'
              ? { y: -40, opacity: 0, scale: 1.5 }
              : phase !== 'enter'
                ? { x: 0, opacity: 1, scale: 1 }
                : { x: -60, opacity: 0, scale: 0.7 }
          }
          transition={{
            type: 'spring',
            stiffness: 180,
            damping: 16,
            delay: phase === 'exit' ? 0 : 0.05,
          }}
        >
          <h1 className="text-7xl md:text-9xl font-black tracking-tighter">
            <span className="bg-gradient-to-r from-emerald-400 via-cyan-400 to-teal-300 bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(16,185,129,0.3)]">
              NERD
            </span>
          </h1>
        </motion.div>

        {/* Title: BATTLE */}
        <motion.div
          initial={{ x: 60, opacity: 0, scale: 0.7 }}
          animate={
            phase === 'exit'
              ? { y: -40, opacity: 0, scale: 1.5 }
              : phase !== 'enter' && phase !== 'title'
                ? { x: 0, opacity: 1, scale: 1 }
                : { x: 60, opacity: 0, scale: 0.7 }
          }
          transition={{
            type: 'spring',
            stiffness: 180,
            damping: 16,
            delay: phase === 'exit' ? 0.05 : 0.15,
          }}
        >
          <h1 className="text-7xl md:text-9xl font-black tracking-tighter -mt-3 md:-mt-5">
            <span className="bg-gradient-to-r from-cyan-400 via-teal-400 to-amber-400 bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(6,182,212,0.3)]">
              BATTLE
            </span>
          </h1>
        </motion.div>

        {/* Subtitle - stays visible during hold */}
        <AnimatePresence>
          {(phase === 'subtitle' || phase === 'hold') && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.4 }}
              className="mt-6"
            >
              <div className="flex items-center justify-center gap-2 text-lg md:text-xl text-muted-foreground font-medium">
                <Zap className="w-5 h-5 text-amber-400" />
                <span>Möge der Klügste gewinnen!</span>
                <Zap className="w-5 h-5 text-amber-400" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Equalizer bars - visible during hold (while TTS is playing) */}
        <AnimatePresence>
          {isHolding && !ttsFinished && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-end justify-center gap-1 mt-8 h-6"
            >
              {[0, 1, 2, 3, 4].map((i) => (
                <motion.div
                  key={i}
                  className="w-1 rounded-full bg-gradient-to-t from-emerald-500 to-cyan-400"
                  animate={{ height: ['8px', `${14 + (i % 3) * 6}px`, '8px'] }}
                  transition={{
                    duration: 0.5 + i * 0.1,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: i * 0.08,
                  }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Pulsing rings */}
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-56 h-56 md:w-72 md:h-72 rounded-full border-2 border-emerald-500/20"
          animate={{
            scale: [1, 1.6, 1],
            opacity: [0.3, 0, 0.3],
          }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-56 h-56 md:w-72 md:h-72 rounded-full border-2 border-cyan-500/20"
          animate={{
            scale: [1, 2, 1],
            opacity: [0.2, 0, 0.2],
          }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
        />
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-56 h-56 md:w-72 md:h-72 rounded-full border border-amber-500/10"
          animate={{
            scale: [1, 2.4, 1],
            opacity: [0.15, 0, 0.15],
          }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 0.8 }}
        />
      </div>
    </motion.div>
  );
}

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = (params.code as string)?.toUpperCase();
  
  // Initialize audio system (sync store → AudioManager, autoplay unlock)
  useAudioInit();
  
  const { joinRoom, reconnectPlayer, emitGameStartReady } = useSocket();
  const { playModeratorSnippet, playSfx } = useAudio();
  const room = useGameStore((s) => s.room);
  const isConnected = useGameStore((s) => s.isConnected);
  const playerId = useGameStore((s) => s.playerId);
  
  const [connectionState, setConnectionState] = useState<ConnectionState>('loading');
  const [playerName, setPlayerName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  
  // === Game Start Animation & Welcome TTS for ALL players ===
  // The lobby → game transition is detected in the Zustand store's setRoom
  // (outside React's rendering pipeline) to avoid React Compiler optimization issues.
  // When gameStartPending is true, we show the GameStartOverlay as an
  // INTERCEPTING screen. The overlay waits for BOTH the animation AND the
  // TTS moderator to finish. On completion, we emit 'game_start_ready'.
  const gameStartPending = useGameStore((s) => s.gameStartPending);
  const clearGameStartPending = useGameStore((s) => s.clearGameStartPending);
  const [showStartAnimation, setShowStartAnimation] = useState(false);
  const ttsPromiseRef = useRef<Promise<void> | undefined>(undefined);

  // When the store signals a game start, trigger the overlay + audio.
  // useLayoutEffect ensures this runs BEFORE the browser paints, so the
  // announcement screen never flashes even for a single frame.
  useLayoutEffect(() => {
    if (gameStartPending) {
      ttsPromiseRef.current = playModeratorSnippet('welcome');
      setShowStartAnimation(true);
      playSfx('fanfare');
      clearGameStartPending();
    }
  }, [gameStartPending, playModeratorSnippet, playSfx, clearGameStartPending]);

  const handleStartAnimationComplete = useCallback(() => {
    setShowStartAnimation(false);
    // Tell the server we're ready - it starts WHEEL_ANIMATION timer from now
    emitGameStartReady();
  }, [emitGameStartReady]);

  // Check for existing session and try to reconnect
  useEffect(() => {
    if (!roomCode || !isConnected) return;
    
    // Already in the room
    if (room && room.code === roomCode) {
      setConnectionState('connected');
      return;
    }
    
    // Check for saved session
    const session = loadSession();
    
    if (session && session.roomCode.toUpperCase() === roomCode) {
      // Try to reconnect with saved session
      setConnectionState('reconnecting');
      setPlayerName(session.playerName);
      
      reconnectPlayer(session.roomCode, session.playerId)
        .then((result) => {
          if (result.success) {
            console.log('🔄 Reconnected successfully!');
            setConnectionState('connected');
          } else {
            // Session invalid, show join form
            console.log('🔄 Reconnect failed:', result.error);
            clearSession();
            setConnectionState('join_form');
          }
        })
        .catch(() => {
          clearSession();
          setConnectionState('join_form');
        });
    } else {
      // No session for this room, show join form
      setConnectionState('join_form');
    }
  }, [roomCode, isConnected, room, reconnectPlayer]);

  // Redirect to home if player was kicked (room becomes null while connected)
  useEffect(() => {
    const session = loadSession();
    // If we were connected but room is now null and no session exists, redirect
    if (isConnected && connectionState === 'connected' && !room && !session) {
      console.log('🚪 Kicked from room, redirecting to home');
      router.push('/');
    }
  }, [isConnected, room, connectionState, router]);

  // Handle join
  const handleJoin = async () => {
    if (!playerName.trim()) {
      setError('Bitte gib deinen Namen ein');
      return;
    }
    
    setJoining(true);
    setError(null);
    
    const result = await joinRoom(roomCode, playerName.trim());
    
    if (result.success) {
      setConnectionState('connected');
    } else {
      setError(result.error || 'Fehler beim Beitreten');
    }
    
    setJoining(false);
  };

  // Render current phase
  const renderScreen = () => {
    if (!room) return null;
    
    // Intercept: Show game start animation INSTEAD of the next screen
    // This prevents the next screen from mounting (and wasting its timers)
    // until the animation is complete.
    // gameStartPending catches the instant the store updates (before the effect fires)
    // showStartAnimation stays true while the overlay plays its animation/TTS
    if (showStartAnimation || gameStartPending) {
      return <GameStartOverlay key="game-start" onComplete={handleStartAnimationComplete} ttsPromise={ttsPromiseRef.current} />;
    }
    
    switch (room.phase) {
      case 'lobby':
        return <LobbyScreen key="lobby" />;
      case 'round_announcement':
      case 'category_announcement':
      case 'bonus_round_announcement':
        return <RoundAnnouncementScreen key="round-announcement" />;
      case 'category_voting':
        return <VotingScreen key="voting" />;
      case 'category_wheel':
        return <CategoryWheelScreen key="wheel" />;
      case 'category_losers_pick':
        return <LosersPickScreen key="losers-pick" />;
      case 'category_dice_royale':
        return <DiceRoyaleScreen key="dice-royale" />;
      case 'category_rps_duel':
        return <RPSDuelScreen key="rps-duel" />;
      case 'question':
      case 'revealing':
        // QuestionScreen handles both question and revealing phases dynamically
        return <QuestionScreen key="question" />;
      case 'estimation':
        return <EstimationScreen key="estimation" />;
      case 'estimation_reveal':
        return <EstimationRevealScreen key="estimation-reveal" />;
      case 'scoreboard':
        return <ScoreboardScreen key="scoreboard" />;
      case 'bonus_round':
      case 'bonus_round_result':
        return <BonusRoundScreen key="bonus-round" />;
      case 'final':
      case 'rematch_voting':
        return <FinalScreen key="final" />;
      default:
        return null;
    }
  };

  // Loading state (waiting for socket connection)
  if (connectionState === 'loading' || !isConnected) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-primary" />
          <p className="text-muted-foreground">Verbinde zum Server...</p>
        </motion.div>
      </div>
    );
  }

  // Reconnecting state
  if (connectionState === 'reconnecting') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-primary" />
          <p className="text-lg font-medium mb-2">Willkommen zurück, {playerName}!</p>
          <p className="text-muted-foreground">Verbinde mit Raum {roomCode}...</p>
        </motion.div>
      </div>
    );
  }

  // Join form
  if (connectionState === 'join_form') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm space-y-6"
        >
          {/* Room Code Display */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary mb-4">
              <Users className="w-4 h-4" />
              Raum beitreten
            </div>
            <h1 className="text-4xl font-mono font-black tracking-[0.3em] text-primary mb-2">
              {roomCode}
            </h1>
            <p className="text-muted-foreground text-sm">Gib deinen Namen ein um beizutreten</p>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); handleJoin(); }} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">
                Dein Name
              </label>
              <Input
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="z.B. QuizMaster"
                maxLength={PLAYER_VALIDATION.NAME_MAX_LENGTH}
                className="h-14 text-lg bg-card border-border"
                autoFocus
              />
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 text-destructive text-sm"
              >
                <AlertCircle className="w-4 h-4" />
                {error}
              </motion.div>
            )}

            <Button
              type="submit"
              disabled={joining || !playerName.trim()}
              className="w-full h-14 text-lg font-bold bg-gradient-to-r from-secondary to-pink-400"
            >
              {joining ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Beitreten
                  <ArrowRight className="w-5 h-5 ml-2" />
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="ghost"
              onClick={() => router.push('/')}
              className="w-full"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Zur Startseite
            </Button>
          </form>
        </motion.div>
      </div>
    );
  }

  // Connected - show game screens
  return (
    <>
      <AnimatePresence mode="wait">
        {renderScreen()}
      </AnimatePresence>
      
      {/* Audio Controls - floating volume widget */}
      <AudioControls />
      
      {/* Dev Panel - only shows in development mode */}
      <DevPanel />
      
      {/* Question Debug Panel - floating panel for question-specific dev actions */}
      <QuestionDebugPanel />
    </>
  );
}

