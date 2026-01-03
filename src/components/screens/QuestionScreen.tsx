'use client';

import { useState, useEffect, useMemo, useRef, useLayoutEffect, useCallback } from 'react';
import { motion, AnimatePresence, useAnimationControls } from 'framer-motion';
import { Clock, Users, Zap, Check, X, Flame, Crown, Info } from 'lucide-react';
import { useSocket } from '@/hooks/useSocket';
import { useGameStore, usePlayers, useCurrentPlayer, useIsHost, useMyResult } from '@/store/gameStore';
import { Card } from '@/components/ui/card';
import { GameAvatar, getMoodForContext, type AvatarMood } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { AnswerResult, Player } from '@/types/game';

const ANSWER_COLORS = [
  { gradient: 'from-red-500 to-red-600', border: 'border-red-500', bg: 'bg-red-500/20', text: 'text-red-400' },
  { gradient: 'from-blue-500 to-blue-600', border: 'border-blue-500', bg: 'bg-blue-500/20', text: 'text-blue-400' },
  { gradient: 'from-yellow-500 to-yellow-600', border: 'border-yellow-500', bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  { gradient: 'from-green-500 to-green-600', border: 'border-green-500', bg: 'bg-green-500/20', text: 'text-green-400' },
];

type RevealPhase = 'answering' | 'expanding' | 'flying' | 'revealing' | 'points' | 'waiting' | 'returning';
type AvatarTarget = { type: 'leaderboard'; index: number } | { type: 'answer'; answerIndex: number; slot: number };

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function QuestionScreen() {
  const { submitAnswer, next } = useSocket();
  const { room, selectedAnswer, setSelectedAnswer, hasSubmitted, setHasSubmitted, lastResults } = useGameStore();
  const players = usePlayers();
  const currentPlayer = useCurrentPlayer();
  const isHost = useIsHost();
  const myResult = useMyResult();
  
  const [timeLeft, setTimeLeft] = useState(0);
  const [revealPhase, setRevealPhase] = useState<RevealPhase>('answering');
  const [flyingIndex, setFlyingIndex] = useState(-1);
  const [showPointsFor, setShowPointsFor] = useState<Set<string>>(new Set());
  
  // Store scores before reveal to prevent spoilers
  const [frozenScores, setFrozenScores] = useState<Map<string, number>>(new Map());
  
  // Position tracking refs
  const containerRef = useRef<HTMLDivElement>(null);
  const leaderboardSlotRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const answerSlotRefs = useRef<Map<string, HTMLDivElement | null>>(new Map()); // "answerIndex-slot"
  
  // Cached positions
  const [containerRect, setContainerRect] = useState<Rect | null>(null);

  const question = room?.currentQuestion;
  const answeredCount = players.filter(p => p.hasAnswered).length;
  const isRevealing = room?.phase === 'revealing';

  // Sort results by answer order
  const sortedByAnswerOrder = useMemo(() => {
    if (!lastResults) return [];
    return [...lastResults].sort((a, b) => {
      if (a.answerOrder === null && b.answerOrder === null) return 0;
      if (a.answerOrder === null) return 1;
      if (b.answerOrder === null) return -1;
      return a.answerOrder - b.answerOrder;
    });
  }, [lastResults]);

  // Group players by answer
  const playersByAnswer = useMemo(() => {
    const groups: Record<number, AnswerResult[]> = {};
    if (!lastResults) return groups;
    lastResults.forEach(result => {
      if (result.answer !== undefined && result.answer !== null) {
        if (!groups[result.answer]) groups[result.answer] = [];
        groups[result.answer].push(result);
      }
    });
    return groups;
  }, [lastResults]);

  // Sorted players for leaderboard
  const sortedPlayers = useMemo(() => {
    if (!lastResults || revealPhase === 'answering') {
      return [...players].sort((a, b) => b.score - a.score);
    }
    const scoreMap = new Map<string, number>();
    lastResults.forEach(r => scoreMap.set(r.playerId, r.newScore));
    return [...players]
      .map(p => ({ ...p, score: scoreMap.get(p.id) ?? p.score }))
      .sort((a, b) => b.score - a.score);
  }, [players, lastResults, revealPhase]);

  // Calculate target for each avatar
  const avatarTargets = useMemo((): Map<string, AvatarTarget> => {
    const targets = new Map<string, AvatarTarget>();
    const answeredPlayers = sortedByAnswerOrder.filter(r => r.answerOrder !== null);
    
    // First, set all to leaderboard
    sortedPlayers.forEach((player, index) => {
      targets.set(player.id, { type: 'leaderboard', index });
    });
    
    // During flying/revealing/points/waiting phases, avatars are at their answers
    // They return to leaderboard during 'returning' phase
    if (revealPhase === 'flying' || revealPhase === 'revealing' || revealPhase === 'points' || revealPhase === 'waiting') {
      const answerSlotCounters: Record<number, number> = {};
      
      answeredPlayers.forEach((result, orderIndex) => {
        // Only fly if index has been reached
        if (revealPhase === 'flying' && orderIndex > flyingIndex) return;
        
        if (result.answer !== undefined && result.answer !== null) {
          const slot = answerSlotCounters[result.answer] ?? 0;
          answerSlotCounters[result.answer] = slot + 1;
          targets.set(result.playerId, { type: 'answer', answerIndex: result.answer, slot });
        }
      });
    }
    
    return targets;
  }, [sortedPlayers, sortedByAnswerOrder, revealPhase, flyingIndex]);

  // Update container rect on mount and resize
  useLayoutEffect(() => {
    const updateRect = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerRect({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
      }
    };
    updateRect();
    window.addEventListener('resize', updateRect);
    return () => window.removeEventListener('resize', updateRect);
  }, []);

  // Timer
  useEffect(() => {
    if (!room?.timerEnd || isRevealing) return;
    const update = () => {
      const remaining = Math.max(0, Math.ceil((room.timerEnd! - Date.now()) / 1000));
      setTimeLeft(remaining);
    };
    update();
    const interval = setInterval(update, 100);
    return () => clearInterval(interval);
  }, [room?.timerEnd, isRevealing]);

  // Track scores during answering phase (before reveal updates them)
  useEffect(() => {
    if (revealPhase === 'answering' && !isRevealing) {
      // Continuously update frozen scores during answering phase
      const scoreMap = new Map<string, number>();
      players.forEach(p => scoreMap.set(p.id, p.score));
      setFrozenScores(scoreMap);
    }
  }, [revealPhase, isRevealing, players]);

  // Start reveal animation
  useEffect(() => {
    if (!lastResults || lastResults.length === 0 || !isRevealing) return;
    if (revealPhase !== 'answering') return;
    setRevealPhase('expanding');
  }, [lastResults, isRevealing, revealPhase]);

  // Expanding -> Flying
  useEffect(() => {
    if (revealPhase !== 'expanding') return;
    const timer = setTimeout(() => {
      setRevealPhase('flying');
      setFlyingIndex(-1);
    }, 700);
    return () => clearTimeout(timer);
  }, [revealPhase]);

  // Flying animation
  useEffect(() => {
    if (revealPhase !== 'flying') return;
    const answeredPlayers = sortedByAnswerOrder.filter(r => r.answerOrder !== null);
    if (flyingIndex < answeredPlayers.length - 1) {
      const timer = setTimeout(() => setFlyingIndex(prev => prev + 1), flyingIndex === -1 ? 200 : 450);
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => setRevealPhase('revealing'), 700);
      return () => clearTimeout(timer);
    }
  }, [revealPhase, flyingIndex, sortedByAnswerOrder]);

  // Revealing -> Points
  useEffect(() => {
    if (revealPhase !== 'revealing') return;
    const timer = setTimeout(() => {
      setRevealPhase('points');
      setShowPointsFor(new Set(lastResults?.map(r => r.playerId) || []));
    }, 1200);
    return () => clearTimeout(timer);
  }, [revealPhase, lastResults]);

  // Points -> Waiting (show results for a moment)
  useEffect(() => {
    if (revealPhase !== 'points') return;
    const timer = setTimeout(() => {
      setRevealPhase('waiting');
      setShowPointsFor(new Set()); // Hide point popups
    }, 2000);
    return () => clearTimeout(timer);
  }, [revealPhase]);

  // Waiting -> Returning (avatars fly back after 3 seconds total viewing time)
  useEffect(() => {
    if (revealPhase !== 'waiting') return;
    const timer = setTimeout(() => {
      setRevealPhase('returning');
    }, 1500); // 2s points + 1.5s waiting = 3.5s total viewing
    return () => clearTimeout(timer);
  }, [revealPhase]);

  // Returning -> Auto-advance to next question
  useEffect(() => {
    if (revealPhase !== 'returning') return;
    const timer = setTimeout(() => {
      // Automatically trigger next (only host's action matters on server)
      if (isHost) {
        next();
      }
    }, 800); // Wait for return animation
    return () => clearTimeout(timer);
  }, [revealPhase, isHost, next]);

  // Reset on new question
  useEffect(() => {
    if (room?.phase === 'question') {
      setRevealPhase('answering');
      setFlyingIndex(-1);
      setShowPointsFor(new Set());
    }
  }, [room?.phase, room?.currentQuestionIndex]);

  const handleAnswer = (index: number) => {
    if (!room || hasSubmitted || isRevealing) return;
    setSelectedAnswer(index);
    setHasSubmitted(true);
    submitAnswer(index);
  };

  if (!question) return null;

  const progress = room?.timerEnd && !isRevealing
    ? Math.max(0, (room.timerEnd - Date.now()) / (room.settings.timePerQuestion * 1000) * 100)
    : 0;

  const correctIndex = question.correctIndex;
  const isExpanded = revealPhase !== 'answering';
  const showCorrect = ['revealing', 'points', 'waiting', 'returning'].includes(revealPhase);

  return (
    <div ref={containerRef} className="relative">
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
                  <p className="text-sm text-primary font-bold">{question.category}</p>
                </div>
              </div>
              {!isRevealing && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Users className="w-4 h-4" />
                    <span className="text-sm font-medium">{answeredCount}/{players.length}</span>
                  </div>
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
                </div>
              )}
            </div>

            {/* Progress Bar */}
            {!isRevealing && (
              <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-6">
                <motion.div
                  className="h-full bg-gradient-to-r from-primary to-secondary"
                  initial={{ width: '100%' }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.1 }}
                />
              </div>
            )}

            {/* Question */}
            <Card className="glass p-6 sm:p-8 mb-6">
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-center leading-tight">
                {question.text}
              </h2>
            </Card>

            {/* Streak Indicator */}
            {!isRevealing && currentPlayer && currentPlayer.streak > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-center gap-2 mb-4 text-orange-500"
              >
                <Zap className="w-5 h-5" />
                <span className="font-bold">{currentPlayer.streak}er Streak!</span>
              </motion.div>
            )}

            {/* Answer Buttons */}
            <motion.div 
              className={cn(
                "grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4",
                // On mobile during reveal: use 2 columns and smaller gaps
                isExpanded && "max-sm:grid-cols-2 max-sm:gap-2"
              )}
              animate={{ gap: isExpanded ? '1rem' : undefined }}
            >
              {question.answers?.map((answer, index) => {
                const colors = ANSWER_COLORS[index];
                const isCorrect = index === correctIndex;
                const playersHere = playersByAnswer[index] || [];
                
                // Count how many avatars will land here
                const avatarsAtAnswer = Array.from(avatarTargets.entries())
                  .filter(([, target]) => target.type === 'answer' && target.answerIndex === index);
                
                return (
                  <motion.div
                    key={index}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ 
                      opacity: 1, 
                      y: 0,
                      // Smaller min-height on mobile during reveal
                      minHeight: isExpanded ? undefined : undefined,
                    }}
                    transition={{ delay: index * 0.1, layout: { duration: 0.5, type: 'spring' } }}
                    className={cn(
                      "relative",
                      // Ensure min-height on desktop, smaller on mobile
                      isExpanded && "sm:min-h-[180px] min-h-[120px]"
                    )}
                  >
                    <motion.div
                      onClick={() => !isRevealing && handleAnswer(index)}
                      className={cn(
                        'relative w-full h-full p-4 rounded-xl border-2 transition-all cursor-pointer',
                        // Smaller padding on mobile during reveal
                        isExpanded && 'max-sm:p-2',
                        colors.border,
                        colors.bg,
                        hasSubmitted && selectedAnswer === index && !isRevealing && 'ring-4 ring-white/50',
                        hasSubmitted && selectedAnswer !== index && !isRevealing && 'opacity-60',
                        showCorrect && isCorrect && 'ring-4 ring-green-500 shadow-lg shadow-green-500/30',
                        showCorrect && !isCorrect && 'opacity-50',
                        isRevealing && 'cursor-default'
                      )}
                    >
                      {/* Correct Badge - only for correct answer */}
                      <AnimatePresence>
                        {showCorrect && isCorrect && (
                          <motion.div
                            initial={{ scale: 0, rotate: -180 }}
                            animate={{ scale: 1, rotate: 0 }}
                            exit={{ scale: 0 }}
                            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                            className="absolute -top-2 -right-2 sm:-top-3 sm:-right-3 w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center z-20 bg-green-500 shadow-lg shadow-green-500/50"
                          >
                            <Check className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Answer Content */}
                      <div className={cn(
                        "flex items-start gap-3",
                        // Smaller on mobile during reveal
                        isExpanded && "max-sm:gap-2"
                      )}>
                        <div className={cn(
                          'w-10 h-10 rounded-lg flex items-center justify-center font-bold shrink-0',
                          // Smaller letter badge on mobile during reveal
                          isExpanded && 'max-sm:w-7 max-sm:h-7 max-sm:text-sm max-sm:rounded-md',
                          colors.bg, colors.text, 'border', colors.border
                        )}>
                          {String.fromCharCode(65 + index)}
                        </div>
                        <span className={cn(
                          "font-medium text-base sm:text-lg pt-2",
                          // Smaller text on mobile during reveal
                          isExpanded && "max-sm:text-xs max-sm:pt-1 max-sm:leading-tight"
                        )}>
                          {answer}
                        </span>
                      </div>

                      {/* Avatar Landing Zone */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className={cn(
                              "mt-4 min-h-[80px] flex flex-wrap gap-3 justify-start items-end",
                              // Smaller on mobile
                              "max-sm:mt-2 max-sm:min-h-[50px] max-sm:gap-1.5"
                            )}
                          >
                            {/* Render avatars sorted by answer order (first to answer = leftmost) */}
                            {avatarsAtAnswer
                              .map(([playerId]) => lastResults?.find(r => r.playerId === playerId))
                              .filter((result): result is AnswerResult => result !== undefined)
                              .sort((a, b) => (a.answerOrder ?? 999) - (b.answerOrder ?? 999))
                              .map((result, slotIndex) => (
                                <AnswerAvatar
                                  key={result.playerId}
                                  result={result}
                                  showPoints={showPointsFor.has(result.playerId)}
                                  slotIndex={slotIndex}
                                  isAtCorrectAnswer={isCorrect}
                                  shouldCelebrate={showCorrect && isCorrect && revealPhase !== 'returning'}
                                  revealPhase={revealPhase}
                                  compact={true}
                                />
                              ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  </motion.div>
                );
              })}
            </motion.div>

            {/* Explanation Box - shows immediately when correct answer is revealed */}
            <AnimatePresence>
              {showCorrect && question.explanation && (
                <motion.div
                  initial={{ opacity: 0, y: 15, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: 0.2, type: 'spring', stiffness: 300, damping: 25 }}
                  className="mt-4 p-4 rounded-xl border border-cyan-500/30 bg-cyan-500/5 backdrop-blur-sm"
                >
                  <div className="flex items-start gap-3">
                    <motion.div 
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ delay: 0.3, type: 'spring', stiffness: 400 }}
                      className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center shrink-0"
                    >
                      <Info className="w-4 h-4 text-cyan-400" />
                    </motion.div>
                    <div>
                      <p className="font-semibold text-cyan-400 text-sm mb-1">💡 Wusstest du?</p>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {question.explanation}
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* My Result Banner */}
            <AnimatePresence>
              {(revealPhase === 'waiting' || revealPhase === 'returning') && myResult && (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className={cn(
                    'mt-4 p-4 rounded-xl border text-center',
                    myResult.correct ? 'border-green-500/50 bg-green-500/10' : 'border-red-500/30 bg-red-500/5'
                  )}
                >
                  <div className="flex items-center justify-center gap-4">
                    <motion.div 
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.2, type: 'spring' }}
                      className={cn(
                        'w-12 h-12 rounded-full flex items-center justify-center',
                        myResult.correct ? 'bg-green-500' : 'bg-red-500/50'
                      )}
                    >
                      {myResult.correct ? <Check className="w-6 h-6 text-white" /> : <X className="w-6 h-6 text-white" />}
                    </motion.div>
                    <div className="text-left">
                      <p className="font-bold text-lg">{myResult.correct ? 'Richtig!' : 'Leider falsch'}</p>
                      <div className="flex items-center gap-2 text-sm">
                        <span className={cn('font-mono font-bold text-lg', myResult.points > 0 ? 'text-green-400' : 'text-muted-foreground')}>
                          +{myResult.points}
                        </span>
                        {myResult.points > 0 && (
                          <span className="text-muted-foreground text-xs">
                            ({myResult.basePoints} + {myResult.timeBonus}⚡ + {myResult.streakBonus}🔥)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submitted State */}
            {hasSubmitted && !isRevealing && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center mt-6">
                <p className="text-muted-foreground animate-pulse">Antwort gesendet! Warte auf andere Spieler...</p>
              </motion.div>
            )}

            {/* Auto-advance indicator */}
            <AnimatePresence>
              {(revealPhase === 'waiting' || revealPhase === 'returning') && (
                <motion.div 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }} 
                  exit={{ opacity: 0 }} 
                  className="text-center mt-6"
                >
                  <motion.div 
                    className="inline-flex items-center gap-2 text-muted-foreground text-sm"
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    <motion.div 
                      className="w-2 h-2 rounded-full bg-primary"
                      animate={{ scale: [1, 1.3, 1] }}
                      transition={{ duration: 0.8, repeat: Infinity }}
                    />
                    Nächste Frage...
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Mobile Leaderboard - show during answering and reveal phases */}
            <div className="lg:hidden mt-4">
              <MobileLeaderboard 
                players={players} 
                showAnswerStatus={!isRevealing}
                frozenScores={frozenScores}
                useFreeze={revealPhase !== 'answering' && !['points', 'waiting', 'returning'].includes(revealPhase)}
                lastResults={lastResults}
                showUpdatedScores={['points', 'waiting', 'returning'].includes(revealPhase)}
                avatarTargets={avatarTargets}
              />
            </div>
          </div>

          {/* Desktop Leaderboard */}
          <div className="hidden lg:block w-80">
            <div className="glass rounded-2xl p-4 space-y-2 sticky top-6">
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Rangliste</h3>
              {sortedPlayers.map((player, index) => {
                const target = avatarTargets.get(player.id);
                const isFlying = target?.type === 'answer';
                const result = lastResults?.find(r => r.playerId === player.id);
                const pointsGained = result?.points ?? 0;
                const showPts = ['points', 'waiting', 'returning'].includes(revealPhase) && pointsGained > 0;
                
                return (
                  <motion.div
                    key={player.id}
                    layout
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-xl transition-all',
                      index === 0 && 'bg-gradient-to-r from-yellow-500/20 to-transparent border border-yellow-500/30',
                      index === 1 && 'bg-gradient-to-r from-gray-400/20 to-transparent',
                      index === 2 && 'bg-gradient-to-r from-amber-700/20 to-transparent',
                      !player.isConnected && 'opacity-50'
                    )}
                  >
                    {/* Rank */}
                    <div className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0',
                      index === 0 && 'bg-yellow-500 text-black',
                      index === 1 && 'bg-gray-400 text-black',
                      index === 2 && 'bg-amber-700 text-white',
                      index > 2 && 'bg-muted text-muted-foreground'
                    )}>
                      {index === 0 ? <Crown className="w-4 h-4" /> : index + 1}
                    </div>

                    {/* Avatar */}
                    <div className="relative w-10 h-10 shrink-0">
                      <motion.div
                        animate={{ 
                          opacity: isFlying ? 0 : 1,
                          scale: isFlying ? 0.3 : 1,
                          y: isFlying ? -20 : 0,
                        }}
                        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                      >
                        <GameAvatar
                          seed={player.avatarSeed}
                          mood={player.hasAnswered ? 'hopeful' : 'neutral'}
                          size="md"
                        />
                        {!isRevealing && player.hasAnswered && (
                          <motion.div 
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center"
                          >
                            <Check className="w-3 h-3 text-white" />
                          </motion.div>
                        )}
                      </motion.div>
                      {isFlying && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="absolute inset-0 rounded-full bg-muted/30 border-2 border-dashed border-muted-foreground/30"
                        />
                      )}
                    </div>

                    {/* Name & Status */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold truncate">{player.name}</span>
                        {player.isHost && <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded shrink-0">Host</span>}
                      </div>
                      {player.streak > 0 && (
                        <span className="flex items-center gap-1 text-xs text-orange-500">
                          <Flame className="w-3 h-3" /> {player.streak}
                        </span>
                      )}
                    </div>

                    {/* Score */}
                    <div className="text-right shrink-0">
                      {/* Use frozen scores during reveal, update to newScore when points phase starts */}
                      {(() => {
                        const isShowingPoints = showPointsFor.has(player.id);
                        // Phases where we should show updated scores (after points have been revealed)
                        const hasRevealedPoints = ['points', 'waiting', 'returning'].includes(revealPhase);
                        
                        let displayScore: number;
                        if (hasRevealedPoints && result?.newScore !== undefined) {
                          // After points phase started - always show updated score
                          displayScore = result.newScore;
                        } else if (revealPhase !== 'answering' && frozenScores.has(player.id)) {
                          // During reveal animation (before points) - show frozen score
                          displayScore = frozenScores.get(player.id)!;
                        } else {
                          // Normal state - show current score
                          displayScore = player.score;
                        }
                        return (
                          <motion.span
                            key={displayScore}
                            initial={isShowingPoints ? { scale: 1.3, color: '#22c55e' } : false}
                            animate={{ scale: 1, color: 'var(--primary)' }}
                            className="font-mono font-black text-lg text-primary block"
                          >
                            {displayScore.toLocaleString()}
                          </motion.span>
                        );
                      })()}
                      <AnimatePresence>
                        {showPts && (
                          <motion.span
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="text-xs text-green-500 font-mono"
                          >
                            +{pointsGained}
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </motion.main>
    </div>
  );
}

// Avatar at answer position with entrance animation
function AnswerAvatar({ 
  result, 
  showPoints, 
  slotIndex,
  isAtCorrectAnswer,
  shouldCelebrate,
  revealPhase,
  compact = false,
}: { 
  result: AnswerResult; 
  showPoints: boolean; 
  slotIndex: number;
  isAtCorrectAnswer: boolean;
  shouldCelebrate: boolean;
  revealPhase: RevealPhase;
  compact?: boolean;
}) {
  const isCorrect = result.correct;
  
  // Determine mood based on reveal phase
  // During flying/expanding: hopeful (anticipating)
  // After reveal: happy/superHappy for correct, sad for incorrect
  const isRevealed = ['revealing', 'points', 'waiting', 'returning'].includes(revealPhase);
  const mood = isRevealed 
    ? getMoodForContext({ isCorrect, points: result.points })
    : 'hopeful';
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0, y: -80, x: 100 }}
      animate={{ 
        opacity: 1, 
        scale: 1, 
        y: shouldCelebrate ? [0, -12, 0, -8, 0, -4, 0] : 0, 
        x: 0,
      }}
      exit={{ 
        opacity: 0, 
        scale: 0.3, 
        y: -60, 
        x: 80,
        transition: {
          type: 'spring',
          stiffness: 400,
          damping: 25,
          delay: slotIndex * 0.06,
        }
      }}
      transition={{ 
        type: 'spring', 
        stiffness: 300, 
        damping: 20,
        delay: slotIndex * 0.08,
        y: shouldCelebrate ? {
          duration: 0.8,
          repeat: Infinity,
          repeatDelay: 1.5 + slotIndex * 0.2,
          ease: 'easeOut',
        } : undefined,
      }}
      className="relative flex flex-col items-center"
    >
      <motion.div 
        className="relative"
        animate={{ 
          rotate: shouldCelebrate ? [0, -8, 8, -5, 5, 0] : [0, -5, 5, 0],
        }}
        transition={{ 
          delay: slotIndex * 0.08 + 0.3, 
          duration: shouldCelebrate ? 0.6 : 0.4,
          repeat: shouldCelebrate ? Infinity : 0,
          repeatDelay: 2 + slotIndex * 0.3,
        }}
      >
        <GameAvatar
          seed={result.avatarSeed}
          mood={mood}
          size={compact ? "sm" : "lg"}
          className={cn(
            'border-2 sm:border-3 shadow-lg',
            // Smaller on mobile via compact prop
            compact && 'max-sm:w-8 max-sm:h-8',
            isRevealed && isCorrect ? 'border-green-500 bg-green-500/20' : 'border-muted-foreground/50 bg-muted/20'
          )}
        />
        {/* Time Badge - smaller on mobile but still visible */}
        {result.responseTimeMs != null && (
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: slotIndex * 0.08 + 0.2, type: 'spring' }}
            className={cn(
              "absolute -top-2 -right-2 px-1.5 py-0.5 rounded-full bg-cyan-500 text-[9px] font-bold text-white shadow-md",
              compact && "max-sm:-top-1 max-sm:-right-1 max-sm:px-1 max-sm:text-[7px]"
            )}
          >
            {(result.responseTimeMs / 1000).toFixed(1)}s
          </motion.div>
        )}
      </motion.div>
      
      <motion.span 
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: slotIndex * 0.08 + 0.15 }}
        className={cn(
          "text-[10px] mt-1 font-medium text-center truncate max-w-[60px]",
          // Smaller name on mobile compact but still visible
          compact && "max-sm:text-[8px] max-sm:max-w-[40px] max-sm:mt-0.5"
        )}
      >
        {result.playerName}
      </motion.span>

      {/* Points Popup */}
      <AnimatePresence>
        {showPoints && (
          <motion.div
            initial={{ opacity: 0, y: 0, scale: 0.5 }}
            animate={{ opacity: 1, y: -8, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.5 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            className={cn(
              "absolute -top-12 left-1/2 -translate-x-1/2 z-50",
              // Smaller and closer on mobile
              compact && "max-sm:-top-8"
            )}
          >
            <motion.div 
              className={cn(
                'px-3 py-1.5 rounded-xl font-mono font-bold text-sm shadow-xl border',
                // Smaller on mobile
                compact && 'max-sm:px-1.5 max-sm:py-0.5 max-sm:text-[10px] max-sm:rounded-lg',
                result.points > 0 
                  ? 'bg-gradient-to-r from-green-500 to-emerald-400 text-white border-green-400' 
                  : 'bg-muted text-muted-foreground border-muted'
              )}
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 0.4, delay: 0.1 }}
            >
              +{result.points}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Mobile Leaderboard
function MobileLeaderboard({ 
  players, 
  showAnswerStatus = false,
  frozenScores,
  useFreeze = false,
  lastResults,
  showUpdatedScores = false,
  avatarTargets,
}: { 
  players: Player[]; 
  showAnswerStatus?: boolean;
  frozenScores?: Map<string, number>;
  useFreeze?: boolean;
  lastResults?: AnswerResult[] | null;
  showUpdatedScores?: boolean;
  avatarTargets?: Map<string, AvatarTarget>;
}) {
  // Calculate display scores based on phase
  const playersWithScores = players.map(p => {
    let displayScore = p.score;
    
    if (showUpdatedScores && lastResults) {
      // Use newScore from results
      const result = lastResults.find(r => r.playerId === p.id);
      if (result?.newScore !== undefined) {
        displayScore = result.newScore;
      }
    } else if (useFreeze && frozenScores?.has(p.id)) {
      // Use frozen score
      displayScore = frozenScores.get(p.id)!;
    }
    
    return { ...p, displayScore };
  });
  
  const sorted = [...playersWithScores].sort((a, b) => b.displayScore - a.displayScore);
  
  return (
    <div className="flex flex-wrap gap-2 justify-center">
      <AnimatePresence mode="popLayout">
        {sorted.map((player, i) => {
          const result = lastResults?.find(r => r.playerId === player.id);
          const pointsGained = result?.points ?? 0;
          const showPointsBadge = showUpdatedScores && pointsGained > 0;
          
          // Check if avatar is flying to an answer
          const target = avatarTargets?.get(player.id);
          const isFlying = target?.type === 'answer';
          
          return (
            <motion.div
              key={player.id}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-full glass text-sm',
                i === 0 && 'border-yellow-500/50 bg-yellow-500/10',
                !player.isConnected && 'opacity-50'
              )}
            >
              {i === 0 && <Crown className="w-3.5 h-3.5 text-yellow-500" />}
              
              {/* Avatar with flying animation */}
              <div className="relative w-6 h-6">
                <motion.div
                  animate={{ 
                    opacity: isFlying ? 0 : 1,
                    scale: isFlying ? 0.3 : 1,
                    y: isFlying ? -10 : 0,
                  }}
                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                >
                  <GameAvatar seed={player.avatarSeed} mood="neutral" size="xs" />
                </motion.div>
                {/* Placeholder when flying */}
                {isFlying && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 rounded-full bg-muted/30 border border-dashed border-muted-foreground/30"
                  />
                )}
              </div>
              
              <span className="font-medium truncate max-w-[80px]">{player.name}</span>
              <motion.span 
                key={player.displayScore}
                initial={showPointsBadge ? { scale: 1.2, color: '#22c55e' } : false}
                animate={{ scale: 1, color: 'var(--primary)' }}
                className="font-mono text-primary font-bold"
              >
                {player.displayScore}
              </motion.span>
              {showPointsBadge && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-[10px] font-mono font-bold text-green-500"
                >
                  +{pointsGained}
                </motion.span>
              )}
              {showAnswerStatus && player.hasAnswered && <Check className="w-3.5 h-3.5 text-green-500" />}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

