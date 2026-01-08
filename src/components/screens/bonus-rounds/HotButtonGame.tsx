'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Clock, Send, Trophy, Check, X, History } from 'lucide-react';
import { useSocket } from '@/hooks/useSocket';
import { getSocket } from '@/lib/socket';
import { useGameStore, usePlayers } from '@/store/gameStore';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Leaderboard } from '@/components/game/Leaderboard';
import { GameAvatar } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { HotButtonBonusRound, HotButtonQuestionResult } from '@/types/game';

/**
 * HotButtonGame - "Hot Button" Bonusrunden-Spieltyp (Redesigned)
 * 
 * Buzzer-Runde: Frage wird schrittweise enthüllt, Spieler buzzern und beantworten.
 * Richtige Antwort: Punkte + Speed-Bonus
 * Falsche Antwort: -500 Punkte, andere dürfen nochmal buzzern
 */

// Sub-Components
function QuestionHistory({ history, currentIndex }: {
  history: HotButtonQuestionResult[];
  currentIndex: number;
}) {
  if (history.length === 0) return null;

  return (
    <Card className="glass p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-3">
        <History className="w-4 h-4 text-muted-foreground" />
        <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
          Bisherige Fragen
        </h4>
      </div>
      <div className="space-y-2 max-h-[200px] overflow-y-auto">
        {history.map((q, i) => (
          <motion.div
            key={`q-${q.questionIndex}`}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className={cn(
              'p-2 rounded-lg text-sm',
              q.result === 'correct' && 'bg-green-500/10 border border-green-500/30',
              q.result === 'wrong' && 'bg-red-500/10 border border-red-500/30',
              q.result === 'timeout' && 'bg-orange-500/10 border border-orange-500/30',
              q.result === 'no_buzz' && 'bg-muted/30 border border-muted'
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground mb-1">
                  Frage {q.questionIndex + 1}
                </p>
                <p className="font-medium truncate" title={q.questionText}>
                  {q.questionText}
                </p>
              </div>
              <div className="shrink-0">
                {q.result === 'correct' && <Check className="w-4 h-4 text-green-500" />}
                {q.result === 'wrong' && <X className="w-4 h-4 text-red-500" />}
                {q.result === 'timeout' && <Clock className="w-4 h-4 text-orange-500" />}
                {q.result === 'no_buzz' && <span className="text-xs text-muted-foreground">Keine Antwort</span>}
              </div>
            </div>

            {/* Answer Info */}
            <div className="mt-2 flex items-center gap-2 text-xs">
              {q.answeredBy ? (
                <>
                  <GameAvatar seed={q.answeredBy.avatarSeed} size="xs" />
                  <span className={cn(
                    'font-medium',
                    q.result === 'correct' ? 'text-green-400' : 'text-red-400'
                  )}>
                    {q.answeredBy.playerName}
                  </span>
                  {q.result === 'correct' && (
                    <span className="text-green-400">
                      +{q.answeredBy.points} ({q.answeredBy.speedBonus > 0 && `+${q.answeredBy.speedBonus} Speed`})
                    </span>
                  )}
                  {q.result === 'wrong' && (
                    <span className="text-red-400">
                      "{q.answeredBy.input}"
                    </span>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground italic">Niemand hat geantwortet</span>
              )}
            </div>

            {/* Correct Answer (always shown) */}
            <div className="mt-1.5 pt-1.5 border-t border-border/50 text-xs">
              <span className="text-muted-foreground">Antwort: </span>
              <span className="font-medium text-primary">{q.correctAnswer}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </Card>
  );
}

function BuzzerOverlay({
  playerName,
  avatarSeed,
  buzzTimeMs,
  revealedPercent
}: {
  playerName: string;
  avatarSeed: string;
  buzzTimeMs: number;
  revealedPercent: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <motion.div
        initial={{ y: 50 }}
        animate={{ y: 0 }}
        className="text-center"
      >
        <motion.div
          animate={{
            scale: [1, 1.1, 1],
            rotate: [0, -3, 3, 0]
          }}
          transition={{ repeat: Infinity, duration: 0.6 }}
          className="relative inline-block"
        >
          <GameAvatar
            seed={avatarSeed}
            mood="superHappy"
            size="xl"
            className="w-32 h-32 border-4 border-amber-500 shadow-2xl shadow-amber-500/50"
          />
          <motion.div
            animate={{ scale: [1, 1.3, 1] }}
            transition={{ repeat: Infinity, duration: 0.5 }}
            className="absolute -top-2 -right-2 w-10 h-10 bg-amber-500 rounded-full flex items-center justify-center"
          >
            <Zap className="w-6 h-6 text-black" />
          </motion.div>
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-3xl sm:text-4xl font-black text-amber-500 mt-6 mb-2"
        >
          {playerName.toUpperCase()} HAT GEBUZZERT!
        </motion.h2>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="flex items-center justify-center gap-4 text-lg"
        >
          <div className="px-3 py-1 glass rounded-full">
            <span className="text-muted-foreground">Zeit: </span>
            <span className="font-mono font-bold">{(buzzTimeMs / 1000).toFixed(2)}s</span>
          </div>
          <div className="px-3 py-1 glass rounded-full">
            <span className="text-muted-foreground">Bei </span>
            <span className="font-mono font-bold text-amber-500">{revealedPercent}%</span>
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

function AnswerResultOverlay({
  correct,
  playerName,
  avatarSeed,
  userInput,
  correctAnswer,
  points,
  speedBonus,
  revealedPercent,
}: {
  correct: boolean;
  playerName: string;
  avatarSeed: string;
  userInput: string;
  correctAnswer: string;
  points: number;
  speedBonus?: number;
  revealedPercent?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="mt-6"
    >
      <Card className={cn(
        'p-6 text-center border-2',
        correct ? 'border-green-500 bg-green-500/10' : 'border-red-500 bg-red-500/10'
      )}>
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          {correct ? (
            <Check className="w-20 h-20 text-green-500 mx-auto mb-4" />
          ) : (
            <X className="w-20 h-20 text-red-500 mx-auto mb-4" />
          )}
        </motion.div>

        <h3 className={cn(
          'text-3xl font-black mb-4',
          correct ? 'text-green-500' : 'text-red-500'
        )}>
          {correct ? 'RICHTIG!' : 'FALSCH!'}
        </h3>

        <div className="flex items-center justify-center gap-3 mb-4">
          <GameAvatar seed={avatarSeed} mood={correct ? 'superHappy' : 'sad'} size="md" />
          <span className="text-xl font-bold">{playerName}</span>
        </div>

        {/* What they answered - for correct show ideal answer, for wrong show their input */}
        {correct && correctAnswer && (
          <div className="inline-block px-4 py-2 rounded-lg mb-4 bg-green-500/20">
            <span className="text-muted-foreground">Antwort: </span>
            <span className="font-mono font-bold">"{correctAnswer}"</span>
          </div>
        )}
        {!correct && userInput && (
          <div className="inline-block px-4 py-2 rounded-lg mb-4 bg-red-500/20">
            <span className="text-muted-foreground">Deine Antwort: </span>
            <span className="font-mono font-bold">"{userInput}"</span>
          </div>
        )}

        {/* Points Breakdown */}
        {correct && points > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-2"
          >
            <div className="flex items-center justify-center gap-4 text-xl font-bold">
              <span className="text-green-400">+{points - (speedBonus || 0)}</span>
              {speedBonus && speedBonus > 0 && (
                <>
                  <span className="text-muted-foreground">+</span>
                  <span className="text-amber-400">+{speedBonus} ⚡</span>
                </>
              )}
              <span className="text-muted-foreground">=</span>
              <motion.span
                initial={{ scale: 1.5 }}
                animate={{ scale: 1 }}
                className="text-3xl text-primary"
              >
                +{points}
              </motion.span>
            </div>
            {revealedPercent !== undefined && (
              <p className="text-sm text-muted-foreground">
                Gebuzzert bei {revealedPercent}% → Speed-Bonus: +{speedBonus}
              </p>
            )}
          </motion.div>
        )}

        {/* Wrong answer display */}
        {!correct && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-4"
          >
            {/* Show correct answer ONLY if no more attempts (correctAnswer will be set) */}
            {correctAnswer ? (
              <>
                <p className="text-muted-foreground mb-2">Die richtige Antwort war:</p>
                <div className="inline-block px-6 py-3 bg-primary/20 rounded-xl border border-primary/30">
                  <span className="text-2xl font-bold text-primary">{correctAnswer}</span>
                </div>
              </>
            ) : (
              <p className="text-amber-500 font-medium">
                ⚡ Andere Spieler können noch buzzern!
              </p>
            )}
            <p className="text-red-400 font-bold mt-3">{points} Punkte</p>
          </motion.div>
        )}

      </Card>
    </motion.div>
  );
}

function NoBuzzResultOverlay({ correctAnswer, questionText }: { correctAnswer: string; questionText: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="mt-6"
    >
      <Card className="p-6 text-center border-2 border-muted bg-muted/10">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          <Clock className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
        </motion.div>

        <h3 className="text-2xl font-bold text-muted-foreground mb-2">
          Zeit abgelaufen!
        </h3>
        <p className="text-muted-foreground mb-6">
          Niemand hat rechtzeitig gebuzzert.
        </p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <p className="text-muted-foreground mb-2">Die richtige Antwort war:</p>
          <div className="inline-block px-6 py-3 bg-primary/20 rounded-xl border border-primary/30">
            <span className="text-2xl font-bold text-primary">{correctAnswer}</span>
          </div>
        </motion.div>
      </Card>
    </motion.div>
  );
}

export function HotButtonGame() {
  const { buzzHotButton, submitHotButtonAnswer } = useSocket();
  const { room, playerId } = useGameStore();
  const players = usePlayers();

  const [inputValue, setInputValue] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);
  const [showBuzzerOverlay, setShowBuzzerOverlay] = useState(false);
  const [buzzerData, setBuzzerData] = useState<{ playerName: string; avatarSeed: string; buzzTimeMs: number; revealedPercent: number } | null>(null);
  const [showHistoryMobile, setShowHistoryMobile] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const hotButton = room?.bonusRound as HotButtonBonusRound | null;
  const isBuzzed = hotButton?.buzzedPlayerId === playerId;
  const isIntro = hotButton?.phase === 'intro';
  const isRevealing = hotButton?.phase === 'question_reveal';
  const isAnswering = hotButton?.phase === 'answering';
  const isResult = hotButton?.phase === 'result';
  const isFinished = hotButton?.phase === 'finished';

  const hasAttempted = hotButton?.attemptedPlayerIds.includes(playerId || '') ?? false;
  const canBuzz = isRevealing && !hasAttempted && !hotButton?.buzzedPlayerId;

  // Keyboard shortcut - Space to buzz
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in input
      if (document.activeElement?.tagName === 'INPUT') return;

      if (e.code === 'Space' && canBuzz) {
        e.preventDefault();
        handleBuzz();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canBuzz]);

  // Listen to hot_button_buzz event for accurate buzz data
  useEffect(() => {
    const socket = getSocket();

    const handleBuzzEvent = (data: {
      playerId: string;
      playerName: string;
      avatarSeed: string;
      buzzTimeMs: number;
      revealedPercent: number;
      timerEnd: number;
    }) => {
      console.log('🔔 Buzz event received:', data);
      setBuzzerData({
        playerName: data.playerName,
        avatarSeed: data.avatarSeed,
        buzzTimeMs: data.buzzTimeMs,
        revealedPercent: data.revealedPercent,
      });
      setShowBuzzerOverlay(true);

      // Hide overlay after 2 seconds
      setTimeout(() => setShowBuzzerOverlay(false), 2000);
    };

    socket.on('hot_button_buzz', handleBuzzEvent);

    return () => {
      socket.off('hot_button_buzz', handleBuzzEvent);
    };
  }, []);

  // Timer
  useEffect(() => {
    if (!hotButton) return;

    const timerEnd = isRevealing ? hotButton.buzzerTimerEnd :
      isAnswering ? hotButton.answerTimerEnd : null;

    if (!timerEnd) {
      setTimeLeft(0);
      return;
    }

    const update = () => {
      const remaining = Math.max(0, Math.ceil((timerEnd - Date.now()) / 1000));
      setTimeLeft(remaining);
    };

    update();
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, [hotButton, isRevealing, isAnswering]);

  // Auto-focus input when buzzed
  useEffect(() => {
    if (isBuzzed && isAnswering && inputRef.current && !showBuzzerOverlay) {
      inputRef.current.focus();
    }
  }, [isBuzzed, isAnswering, showBuzzerOverlay]);

  const handleBuzz = useCallback(() => {
    if (!canBuzz) return;
    buzzHotButton();
  }, [canBuzz, buzzHotButton]);

  const handleSubmit = useCallback(() => {
    if (!inputValue.trim() || !isBuzzed) return;
    submitHotButtonAnswer(inputValue.trim());
    setInputValue('');
  }, [inputValue, isBuzzed, submitHotButtonAnswer]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  if (!hotButton) return null;

  const questionHistory = hotButton.questionHistory || [];

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen p-4 sm:p-6"
    >
      {/* Buzzer Overlay */}
      <AnimatePresence>
        {showBuzzerOverlay && buzzerData && (
          <BuzzerOverlay {...buzzerData} />
        )}
      </AnimatePresence>

      <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-6">
        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <motion.div
                animate={{ rotate: [0, -15, 15, 0], scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 2, repeatDelay: 1 }}
                className="text-3xl"
              >
                ⚡
              </motion.div>
              <div>
                <p className="text-sm text-muted-foreground font-medium">
                  Bonusrunde · Hot Button
                </p>
                <p className="text-sm text-amber-500 font-bold">
                  {hotButton.category || 'Allgemeinwissen'}
                </p>
              </div>
            </div>

            {/* Progress & Timer */}
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Frage</p>
                <p className="font-mono font-bold text-lg">
                  <span className="text-amber-500">{hotButton.currentQuestionIndex + 1}</span>
                  <span className="text-muted-foreground">/{hotButton.totalQuestions}</span>
                </p>
              </div>

              {/* Timer */}
              {(isRevealing || isAnswering) && timeLeft > 0 && (
                <motion.div
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-full font-mono font-bold text-lg',
                    timeLeft <= 5 ? 'bg-red-500/20 text-red-500' : 'glass'
                  )}
                  animate={timeLeft <= 5 ? { scale: [1, 1.05, 1] } : {}}
                  transition={{ repeat: Infinity, duration: 0.5 }}
                >
                  <Clock className="w-5 h-5" />
                  {timeLeft}s
                </motion.div>
              )}
            </div>
          </div>

          {/* Intro Phase */}
          {isIntro && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex-1 flex items-center justify-center"
            >
              <Card className="glass p-8 max-w-2xl w-full text-center">
                <motion.div
                  animate={{ scale: [1, 1.2, 1], rotate: [0, 5, -5, 0] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="text-6xl mb-6"
                >
                  ⚡
                </motion.div>
                <h2 className="text-3xl font-bold mb-4">{hotButton.topic}</h2>
                {hotButton.description && (
                  <p className="text-lg text-muted-foreground mb-6">{hotButton.description}</p>
                )}
                <div className="glass rounded-xl p-4 mb-6">
                  <p className="text-sm font-medium text-amber-500 mb-3">🎯 Wie funktioniert's?</p>
                  <ul className="text-sm text-left space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="text-amber-500 shrink-0">1.</span>
                      <span>Die Frage wird Zeichen für Zeichen enthüllt</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-amber-500 shrink-0">2.</span>
                      <span>Drücke <kbd className="px-2 py-0.5 bg-muted rounded text-xs font-mono">SPACE</kbd> oder den Button zum Buzzern</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-amber-500 shrink-0">3.</span>
                      <span>Früher buzzern = mehr Speed-Bonus! (bis zu +500)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-red-500 shrink-0">⚠️</span>
                      <span>Falsche Antwort: <strong>-500 Punkte!</strong></span>
                    </li>
                  </ul>
                </div>
                <motion.div
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="text-muted-foreground text-sm"
                >
                  Die Runde startet gleich...
                </motion.div>
              </Card>
            </motion.div>
          )}

          {/* Question Phase */}
          {(isRevealing || isAnswering || isResult) && (
            <>
              {/* Reveal Progress Bar */}
              {isRevealing && (
                <div className="mb-2">
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-amber-500 to-orange-500"
                      animate={{ width: `${hotButton.revealedPercent || 0}%` }}
                      transition={{ duration: 0.1 }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground text-center mt-1">
                    {hotButton.revealedPercent || 0}% enthüllt
                  </p>
                </div>
              )}

              {/* Question Card */}
              <Card className="glass p-6 mb-4">
                <div className="min-h-[8rem] flex items-center justify-center">
                  <p className="text-2xl sm:text-3xl font-bold text-center leading-relaxed">
                    {hotButton.currentQuestionText}
                    {!hotButton.isFullyRevealed && isRevealing && (
                      <motion.span
                        animate={{ opacity: [1, 0, 1] }}
                        transition={{ repeat: Infinity, duration: 0.8 }}
                        className="inline-block w-1 h-8 bg-amber-500 ml-1 align-middle"
                      />
                    )}
                  </p>
                </div>
              </Card>

              {/* Buzzer / Answer Area */}
              <Card className="glass p-6">
                {/* Buzzer Button */}
                {isRevealing && canBuzz && (
                  <div className="space-y-3">
                    <Button
                      onClick={handleBuzz}
                      size="lg"
                      className="w-full h-24 text-2xl font-bold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-black shadow-lg shadow-amber-500/30"
                    >
                      <Zap className="w-8 h-8 mr-3" />
                      BUZZERN!
                    </Button>
                    <p className="text-center text-sm text-muted-foreground">
                      Oder drücke <kbd className="px-2 py-0.5 bg-muted rounded text-xs font-mono">SPACE</kbd>
                    </p>
                  </div>
                )}

                {/* Already attempted */}
                {isRevealing && hasAttempted && (
                  <div className="text-center py-8">
                    <X className="w-12 h-12 text-red-500 mx-auto mb-3" />
                    <p className="text-muted-foreground">
                      Du hast bereits einen Versuch für diese Frage.
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Warte auf die nächste Frage...
                    </p>
                  </div>
                )}

                {/* Someone else buzzed (waiting) */}
                {isRevealing && !canBuzz && !hasAttempted && hotButton.buzzedPlayerName && (
                  <div className="text-center py-8">
                    <motion.div
                      animate={{ scale: [1, 1.05, 1] }}
                      transition={{ repeat: Infinity, duration: 1 }}
                    >
                      <Zap className="w-12 h-12 text-amber-500 mx-auto mb-3" />
                    </motion.div>
                    <p className="text-lg font-bold mb-1">
                      <strong>{hotButton.buzzedPlayerName}</strong> hat gebuzzert!
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Warte auf die Antwort...
                    </p>
                  </div>
                )}

                {/* Answer Input (for buzzed player) */}
                {isAnswering && isBuzzed && !showBuzzerOverlay && (
                  <div className="space-y-4">
                    <motion.div
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="text-center mb-4"
                    >
                      <p className="text-lg font-bold text-amber-500 mb-1">
                        ⚡ Du bist dran!
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Gib deine Antwort ein:
                      </p>
                    </motion.div>
                    <div className="flex gap-2">
                      <input
                        ref={inputRef}
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Deine Antwort..."
                        className="flex-1 px-4 py-3 rounded-xl bg-background border-2 border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none text-lg"
                        autoComplete="off"
                      />
                      <Button
                        onClick={handleSubmit}
                        disabled={!inputValue.trim()}
                        size="lg"
                        className="px-6 font-bold bg-amber-500 hover:bg-amber-600 text-black"
                      >
                        <Send className="w-5 h-5" />
                      </Button>
                    </div>
                    <p className="text-xs text-center text-muted-foreground">
                      Tippfehler werden toleriert!
                    </p>
                  </div>
                )}

                {/* Waiting for answer */}
                {isAnswering && !isBuzzed && !showBuzzerOverlay && (
                  <div className="text-center py-8">
                    <motion.div
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ repeat: Infinity, duration: 1.5 }}
                    >
                      <p className="text-muted-foreground">
                        <strong>{hotButton.buzzedPlayerName}</strong> antwortet...
                      </p>
                    </motion.div>
                  </div>
                )}
              </Card>

              {/* Result Display */}
              {isResult && hotButton.lastAnswer && (
                <AnswerResultOverlay
                  correct={hotButton.lastAnswer.correct}
                  playerName={hotButton.lastAnswer.playerName}
                  avatarSeed={hotButton.buzzedPlayerAvatarSeed || ''}
                  userInput={hotButton.lastAnswer.input}
                  correctAnswer={hotButton.lastAnswer.correctAnswer || ''}
                  points={hotButton.lastAnswer.points || 0}
                  speedBonus={hotButton.lastAnswer.speedBonus}
                />
              )}

              {/* No buzz result - shown when no one buzzed (checked via questionHistory) */}
              {isResult && !hotButton.lastAnswer && hotButton.questionHistory.length > 0 && (
                <NoBuzzResultOverlay
                  correctAnswer={hotButton.questionHistory[hotButton.questionHistory.length - 1]?.correctAnswer || ''}
                  questionText={hotButton.currentQuestionText}
                />
              )}
            </>
          )}

          {/* Finished State */}
          {isFinished && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex-1 flex items-center justify-center"
            >
              <Card className="glass p-8 max-w-2xl w-full text-center">
                <Trophy className="w-16 h-16 text-amber-500 mx-auto mb-4" />
                <h3 className="text-3xl font-bold mb-4">Hot Button beendet!</h3>
                <p className="text-muted-foreground mb-6">
                  {hotButton.totalQuestions} Fragen gespielt
                </p>

                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-2">Ergebnisse werden ausgewertet...</p>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full mx-auto"
                  />
                </div>
              </Card>
            </motion.div>
          )}

          {/* Mobile History Toggle */}
          {questionHistory.length > 0 && !isIntro && !isFinished && (
            <div className="lg:hidden mt-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowHistoryMobile(!showHistoryMobile)}
                className="w-full"
              >
                <History className="w-4 h-4 mr-2" />
                {showHistoryMobile ? 'History ausblenden' : `History anzeigen (${questionHistory.length})`}
              </Button>
              <AnimatePresence>
                {showHistoryMobile && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden mt-2"
                  >
                    <QuestionHistory history={questionHistory} currentIndex={hotButton.currentQuestionIndex} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Desktop Sidebar */}
        <div className="hidden lg:flex lg:flex-col lg:w-80 gap-4">
          {/* Leaderboard */}
          <div className="sticky top-6">
            <Leaderboard
              customBadge={(player) => {
                const isBuzzedPlayer = hotButton?.buzzedPlayerId === player.id;
                if (isBuzzedPlayer && isAnswering) {
                  return (
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ repeat: Infinity, duration: 1 }}
                      className="absolute -bottom-1 -right-1 w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center"
                    >
                      <Zap className="w-3 h-3 text-black" />
                    </motion.div>
                  );
                }
                return null;
              }}
              customStatus={(player) => {
                const roundScore = hotButton?.playerScores[player.id] || 0;
                const hasAttemptedThis = hotButton?.attemptedPlayerIds.includes(player.id) ?? false;
                const isBuzzedPlayer = hotButton?.buzzedPlayerId === player.id;

                let text = '';
                let color = '';

                if (isBuzzedPlayer) {
                  text = 'Am Zug';
                  color = 'text-amber-500';
                } else if (hasAttemptedThis) {
                  text = 'Hat versucht';
                  color = 'text-muted-foreground';
                }

                return { text, color, score: roundScore };
              }}
              highlightPlayerId={hotButton?.buzzedPlayerId}
            />
          </div>

          {/* Desktop History */}
          {questionHistory.length > 0 && !isIntro && (
            <QuestionHistory history={questionHistory} currentIndex={hotButton.currentQuestionIndex} />
          )}
        </div>
      </div>
    </motion.main>
  );
}
