'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Clock, Send, Trophy, Check, X } from 'lucide-react';
import { useSocket } from '@/hooks/useSocket';
import { useGameStore } from '@/store/gameStore';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Leaderboard } from '@/components/game/Leaderboard';
import { cn } from '@/lib/utils';
import type { HotButtonBonusRound } from '@/types/game';

/**
 * HotButtonGame - "Hot Button" Bonusrunden-Spieltyp
 * 
 * Buzzer-Runde: Frage wird schrittweise enthüllt, Spieler buzzern und beantworten.
 * Richtige Antwort: Punkte + Speed-Bonus
 * Falsche Antwort: -500 Punkte, andere dürfen nochmal buzzern
 */
export function HotButtonGame() {
  const { buzzHotButton, submitHotButtonAnswer } = useSocket();
  const { room, playerId } = useGameStore();
  
  const [inputValue, setInputValue] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const hotButton = room?.bonusRound as HotButtonBonusRound | null;
  const isBuzzed = hotButton?.buzzedPlayerId === playerId;
  const isIntro = hotButton?.phase === 'intro';
  const isRevealing = hotButton?.phase === 'question_reveal';
  const isAnswering = hotButton?.phase === 'answering';
  const isResult = hotButton?.phase === 'result';
  const isFinished = hotButton?.phase === 'finished';
  
  const hasAttempted = hotButton?.attemptedPlayerIds.includes(playerId || '') ?? false;
  const canBuzz = isRevealing && !hasAttempted;

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
    if (isBuzzed && isAnswering && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isBuzzed, isAnswering]);

  const handleBuzz = () => {
    if (!canBuzz) return;
    buzzHotButton();
  };

  const handleSubmit = () => {
    if (!inputValue.trim() || !isBuzzed) return;
    submitHotButtonAnswer(inputValue.trim());
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  if (!hotButton) return null;

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
            
            {/* Progress */}
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
                <div className="glass rounded-xl p-4 mb-4">
                  <p className="text-sm font-medium text-amber-500 mb-2">🎯 Wie funktioniert's?</p>
                  <ul className="text-sm text-left space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="text-amber-500 shrink-0">1.</span>
                      <span>Die Frage wird Zeichen für Zeichen enthüllt</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-amber-500 shrink-0">2.</span>
                      <span>Buzzere sobald du die Antwort weißt (früher = mehr Bonus!)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-amber-500 shrink-0">3.</span>
                      <span>Richtige Antwort: Punkte + Speed-Bonus</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-red-500 shrink-0">4.</span>
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
                {hotButton.isFullyRevealed && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center text-sm text-green-500 font-medium mt-3"
                  >
                    ✓ Vollständig enthüllt
                  </motion.div>
                )}
              </Card>

              {/* Buzzer / Answer Area */}
              <Card className="glass p-6">
                {isRevealing && canBuzz && (
                  <Button
                    onClick={handleBuzz}
                    size="lg"
                    className="w-full h-24 text-2xl font-bold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-black shadow-lg"
                  >
                    <Zap className="w-8 h-8 mr-3" />
                    BUZZERN!
                  </Button>
                )}

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

                {isAnswering && isBuzzed && (
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

                {isAnswering && !isBuzzed && (
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

                {isResult && hotButton.lastAnswer && (
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-center py-6"
                  >
                    {hotButton.lastAnswer.correct ? (
                      <>
                        <Check className="w-16 h-16 text-green-500 mx-auto mb-4" />
                        <p className="text-2xl font-bold text-green-500 mb-2">RICHTIG!</p>
                        <p className="text-lg">
                          <strong>{hotButton.lastAnswer.playerName}</strong>
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          "{hotButton.lastAnswer.input}"
                        </p>
                      </>
                    ) : (
                      <>
                        <X className="w-16 h-16 text-red-500 mx-auto mb-4" />
                        <p className="text-2xl font-bold text-red-500 mb-2">FALSCH!</p>
                        <p className="text-lg">
                          <strong>{hotButton.lastAnswer.playerName}</strong>
                        </p>
                        {hotButton.lastAnswer.input && (
                          <p className="text-sm text-muted-foreground mt-1">
                            "{hotButton.lastAnswer.input}"
                          </p>
                        )}
                        {hotButton.remainingAttempts > 0 && (
                          <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-sm text-amber-500 font-medium mt-3"
                          >
                            Noch {hotButton.remainingAttempts} Versuch{hotButton.remainingAttempts !== 1 ? 'e' : ''} übrig!
                          </motion.p>
                        )}
                      </>
                    )}
                  </motion.div>
                )}
              </Card>
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
        </div>

        {/* Desktop Sidebar - Leaderboard */}
        <div className="hidden lg:block w-80">
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
        </div>

        {/* Mobile Player List */}
        <div className="lg:hidden">
          <Leaderboard compact />
        </div>
      </div>
    </motion.main>
  );
}

