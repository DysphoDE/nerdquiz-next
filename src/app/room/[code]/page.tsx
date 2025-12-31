'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { useSocket } from '@/hooks/useSocket';
import { useGameStore } from '@/store/gameStore';
import { loadSession, hasSessionForRoom, clearSession } from '@/lib/session';
import { DevPanel } from '@/components/dev/DevPanel';
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
import { Loader2, ArrowRight, ArrowLeft, Users, AlertCircle } from 'lucide-react';

type ConnectionState = 'loading' | 'reconnecting' | 'join_form' | 'connected' | 'error';

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = (params.code as string)?.toUpperCase();
  
  const { joinRoom, reconnectPlayer } = useSocket();
  const room = useGameStore((s) => s.room);
  const isConnected = useGameStore((s) => s.isConnected);
  const playerId = useGameStore((s) => s.playerId);
  
  const [connectionState, setConnectionState] = useState<ConnectionState>('loading');
  const [playerName, setPlayerName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

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
                maxLength={16}
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
      
      {/* Dev Panel - only shows in development mode */}
      <DevPanel />
    </>
  );
}

