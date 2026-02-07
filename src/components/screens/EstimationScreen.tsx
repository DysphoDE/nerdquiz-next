'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Calculator, Users } from 'lucide-react';
import { useSocket } from '@/hooks/useSocket';
import { useGameStore, usePlayers } from '@/store/gameStore';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Leaderboard, GameTimer, useGameTimer } from '@/components/game';
import { useAudio } from '@/hooks/useAudio';

export function EstimationScreen() {
  const { submitEstimation } = useSocket();
  const { room, hasSubmitted, setHasSubmitted, estimationValue, setEstimationValue } = useGameStore();
  const players = usePlayers();
  const inputRef = useRef<HTMLInputElement>(null);
  const { playMusic, playTTS, stopTTS } = useAudio();

  const question = room?.currentQuestion;
  const answeredCount = players.filter(p => p.hasAnswered).length;

  // Play estimation music when entering
  useEffect(() => {
    playMusic('estimation');
  }, [playMusic]);

  // TTS: Schätzfrage vorlesen wenn sie erscheint
  useEffect(() => {
    if (question?.text) {
      playTTS(question.text, {
        instructionKey: 'ESTIMATION',
        questionId: question.id,
      });
    }
    return () => {
      stopTTS();
    };
  }, [question?.text, question?.id, playTTS, stopTTS]);

  // Synchronized timer using server time
  const { remaining: timeLeft } = useGameTimer(room?.timerEnd ?? null, room?.serverTime);

  // Auto-focus input
  useEffect(() => {
    if (!hasSubmitted) {
      inputRef.current?.focus();
    }
  }, [hasSubmitted]);

  const handleSubmit = () => {
    if (!room || hasSubmitted) return;
    
    const value = parseFloat(estimationValue);
    if (isNaN(value)) return;

    submitEstimation(value);
    setHasSubmitted(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  if (!question) return null;

  // Calculate progress from synchronized timer
  const durationMs = room?.settings.timePerQuestion ? room.settings.timePerQuestion * 1000 : 0;
  const progress = durationMs > 0 ? Math.max(0, (timeLeft * 1000 / durationMs) * 100) : 0;

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen p-4 sm:p-6"
    >
      <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-6">
        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{question.categoryIcon}</span>
              <div>
                <p className="text-sm text-muted-foreground font-medium">
                  Frage {(room?.currentQuestionIndex || 0) + 1} / {room?.totalQuestions}
                </p>
                <p className="text-sm text-secondary font-bold">Schätzfrage</p>
              </div>
            </div>

            {/* Timer - Server-synchronized */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="w-4 h-4" />
                <span className="text-sm font-medium">{answeredCount}/{players.length}</span>
              </div>
              <GameTimer
                timerEnd={room?.timerEnd ?? null}
                serverTime={room?.serverTime}
                durationMs={room?.settings.timePerQuestion ? room.settings.timePerQuestion * 1000 : undefined}
                warningThreshold={5}
                criticalThreshold={3}
              />
            </div>
          </div>

          {/* Progress Bar */}
          <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-6">
            <motion.div
              className="h-full bg-gradient-to-r from-secondary to-primary"
              initial={{ width: '100%' }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.1 }}
            />
          </div>

          {/* Question */}
          <Card className="glass p-6 sm:p-8 mb-6">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-secondary/20">
                <Calculator className="w-6 h-6 text-secondary" />
              </div>
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold leading-tight">
                {question.text}
              </h2>
            </div>
          </Card>

          {/* Input Area */}
          <AnimatePresence mode="wait">
            {hasSubmitted ? (
              <motion.div
                key="submitted"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex-1 flex items-center justify-center"
              >
                <Card className="glass p-8 text-center max-w-md">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center"
                  >
                    <Send className="w-10 h-10 text-green-500" />
                  </motion.div>
                  <h3 className="text-xl font-bold mb-2">Antwort gesendet!</h3>
                  <p className="text-muted-foreground mb-4">
                    Deine Schätzung: <span className="font-mono font-bold text-secondary text-lg sm:text-xl lg:text-2xl">{estimationValue}</span>
                    {question.unit && <span className="text-sm sm:text-base lg:text-lg ml-2">{question.unit}</span>}
                  </p>
                  <p className="text-sm text-muted-foreground animate-pulse">
                    Warte auf andere Spieler...
                  </p>
                </Card>
              </motion.div>
            ) : (
              <motion.div
                key="input"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex-1 flex flex-col items-center justify-center"
              >
                <div className="w-full max-w-md space-y-4">
                  <div className="relative">
                    <input
                      ref={inputRef}
                      type="number"
                      inputMode="decimal"
                      value={estimationValue}
                      onChange={(e) => setEstimationValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Deine Schätzung..."
                      className="w-full text-center text-2xl sm:text-3xl lg:text-4xl font-mono font-bold bg-transparent border-b-4 border-primary/50 focus:border-primary outline-none py-3 sm:py-4 placeholder:text-muted-foreground/30 placeholder:text-lg"
                      autoComplete="off"
                    />
                    {question.unit && (
                      <span className="absolute right-0 bottom-3 sm:bottom-4 text-base sm:text-xl lg:text-2xl text-muted-foreground font-medium">
                        {question.unit}
                      </span>
                    )}
                  </div>

                  <Button
                    onClick={handleSubmit}
                    disabled={!estimationValue || isNaN(parseFloat(estimationValue))}
                    className="w-full btn-3d bg-secondary hover:bg-secondary/90 py-6 text-lg font-bold glow-secondary"
                  >
                    <Send className="w-5 h-5 mr-2" />
                    Antwort senden
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Player Status (Mobile) */}
          <div className="lg:hidden mt-6">
            <Leaderboard compact showAnswerStatus />
          </div>
        </div>

        {/* Desktop Sidebar */}
        <div className="hidden lg:block w-80">
          <Leaderboard showAnswerStatus />
        </div>
      </div>
    </motion.main>
  );
}

