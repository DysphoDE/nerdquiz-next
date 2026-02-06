'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
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

function GameStartOverlay({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState<'enter' | 'title' | 'subtitle' | 'flash' | 'exit'>('enter');

  // Tight timing: total ~2.5s so the next screen (round_announcement)
  // still has enough of its server-side timer left (e.g. WHEEL_ANIMATION = 5.5s)
  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase('title'), 150),
      setTimeout(() => setPhase('subtitle'), 700),
      setTimeout(() => setPhase('flash'), 1700),
      setTimeout(() => setPhase('exit'), 2000),
      setTimeout(() => onComplete(), 2500),
    ];
    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="min-h-screen flex items-center justify-center overflow-hidden relative"
      style={{ background: 'radial-gradient(ellipse at center, #0a0a1a 0%, #000000 100%)' }}
    >
      {/* Animated background particles */}
      <div className="absolute inset-0 overflow-hidden">
        {Array.from({ length: 20 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 rounded-full"
            style={{
              left: `${10 + (i * 4.2) % 80}%`,
              top: `${20 + (i * 3.7) % 60}%`,
              background: ['#06b6d4', '#10b981', '#f59e0b', '#14b8a6', '#22d3ee'][i % 5],
            }}
            initial={{ opacity: 0, scale: 0 }}
            animate={{
              opacity: [0, 1, 0],
              scale: [0, 2.5, 0],
              y: [0, -80 - (i % 5) * 30],
              x: [0, ((i % 3) - 1) * 40],
            }}
            transition={{
              duration: 1.5 + (i % 3) * 0.5,
              delay: 0.1 + (i % 8) * 0.15,
              ease: 'easeOut',
            }}
          />
        ))}
      </div>

      {/* Energy lines */}
      <AnimatePresence>
        {(phase === 'title' || phase === 'subtitle') && (
          <>
            <motion.div
              className="absolute left-0 top-1/2 -translate-y-1/2 w-2/5 h-[2px]"
              style={{ background: 'linear-gradient(90deg, transparent, #10b981, transparent)' }}
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: [0, 1, 0.6] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
            />
            <motion.div
              className="absolute right-0 top-1/2 -translate-y-1/2 w-2/5 h-[2px]"
              style={{ background: 'linear-gradient(270deg, transparent, #06b6d4, transparent)' }}
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: [0, 1, 0.6] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
            />
          </>
        )}
      </AnimatePresence>

      {/* Central glow */}
      <motion.div
        className="absolute w-64 h-64 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(16,185,129,0.3) 0%, rgba(6,182,212,0.15) 50%, transparent 70%)',
          filter: 'blur(40px)',
        }}
        animate={{
          scale: phase === 'flash' ? [1, 3] : [1, 1.3, 1],
          opacity: phase === 'flash' ? [0.5, 1] : [0.3, 0.6, 0.3],
        }}
        transition={{
          duration: phase === 'flash' ? 0.3 : 1.5,
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
            animate={{ opacity: [0, 0.7, 0] }}
            transition={{ duration: 0.4 }}
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
          className="mb-4 flex justify-center"
        >
          <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-br from-emerald-500 via-cyan-500 to-teal-500 flex items-center justify-center shadow-2xl shadow-emerald-500/30">
            <Swords className="w-8 h-8 md:w-10 md:h-10 text-white" />
          </div>
        </motion.div>

        {/* Title: NERD */}
        <motion.div
          initial={{ y: 30, opacity: 0, scale: 0.5 }}
          animate={
            phase === 'exit'
              ? { y: -30, opacity: 0, scale: 1.3 }
              : { y: 0, opacity: 1, scale: 1 }
          }
          transition={{ type: 'spring', stiffness: 200, damping: 18, delay: phase === 'exit' ? 0 : 0.05 }}
        >
          <h1 className="text-6xl md:text-8xl font-black tracking-tighter">
            <span className="bg-gradient-to-r from-emerald-400 via-cyan-400 to-teal-300 bg-clip-text text-transparent">
              NERD
            </span>
          </h1>
        </motion.div>

        {/* Title: BATTLE */}
        <motion.div
          initial={{ y: 30, opacity: 0, scale: 0.5 }}
          animate={
            phase === 'exit'
              ? { y: -30, opacity: 0, scale: 1.3 }
              : phase !== 'enter'
                ? { y: 0, opacity: 1, scale: 1 }
                : { y: 30, opacity: 0, scale: 0.5 }
          }
          transition={{ type: 'spring', stiffness: 200, damping: 18, delay: phase === 'exit' ? 0.03 : 0.15 }}
        >
          <h1 className="text-6xl md:text-8xl font-black tracking-tighter -mt-2 md:-mt-3">
            <span className="bg-gradient-to-r from-cyan-400 via-teal-400 to-amber-400 bg-clip-text text-transparent">
              BATTLE
            </span>
          </h1>
        </motion.div>

        {/* Subtitle */}
        <AnimatePresence>
          {(phase === 'subtitle' || phase === 'flash') && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="mt-5"
            >
              <div className="flex items-center justify-center gap-2 text-lg md:text-xl text-muted-foreground font-medium">
                <Zap className="w-5 h-5 text-amber-400" />
                <span>Möge der Klügste gewinnen!</span>
                <Zap className="w-5 h-5 text-amber-400" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Pulsing rings */}
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 md:w-64 md:h-64 rounded-full border-2 border-emerald-500/20"
          animate={{
            scale: [1, 1.5, 1],
            opacity: [0.3, 0, 0.3],
          }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 md:w-64 md:h-64 rounded-full border-2 border-cyan-500/20"
          animate={{
            scale: [1, 1.8, 1],
            opacity: [0.2, 0, 0.2],
          }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
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
  
  const { joinRoom, reconnectPlayer } = useSocket();
  const { playModeratorSnippet, playSfx } = useAudio();
  const room = useGameStore((s) => s.room);
  const isConnected = useGameStore((s) => s.isConnected);
  const playerId = useGameStore((s) => s.playerId);
  
  const [connectionState, setConnectionState] = useState<ConnectionState>('loading');
  const [playerName, setPlayerName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  
  // === Game Start Animation & Welcome TTS for ALL players ===
  // When the phase transitions from 'lobby' to any game phase, we show
  // the GameStartOverlay as an INTERCEPTING screen. This prevents the
  // next screen (e.g. RoundAnnouncementScreen) from mounting until the
  // animation finishes, so its server-driven timers aren't wasted.
  const [showStartAnimation, setShowStartAnimation] = useState(false);
  const prevPhaseRef = useRef<string | null>(null);
  
  useEffect(() => {
    const currentPhase = room?.phase ?? null;
    const prevPhase = prevPhaseRef.current;
    
    // Detect transition from lobby to any game phase
    if (prevPhase === 'lobby' && currentPhase && currentPhase !== 'lobby') {
      // Show the start animation screen for ALL players
      setShowStartAnimation(true);
      // Play welcome TTS for ALL players (not just host)
      playModeratorSnippet('welcome');
      // Play a dramatic SFX
      playSfx('fanfare');
    }
    
    prevPhaseRef.current = currentPhase;
  }, [room?.phase, playModeratorSnippet, playSfx]);
  
  const handleStartAnimationComplete = useCallback(() => {
    setShowStartAnimation(false);
  }, []);

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
    if (showStartAnimation) {
      return <GameStartOverlay key="game-start" onComplete={handleStartAnimationComplete} />;
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

