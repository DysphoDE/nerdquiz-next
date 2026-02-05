'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Clock, 
  Send, 
  SkipForward, 
  Trophy, 
  X, 
  Check,
  Timer,
  Crown,
  AlertCircle,
  Flame,
  Zap,
} from 'lucide-react';
import { useSocket } from '@/hooks/useSocket';
import { useGameStore, usePlayers, type BonusRoundEndResult } from '@/store/gameStore';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Leaderboard, GameTimer, useGameTimer } from '@/components/game';
import { GameAvatar } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { CollectiveListBonusRound } from '@/types/game';

// ============================================
// TURN INDICATOR MIT ZÜNDSCHNUR
// ============================================

interface AnswerFeedback {
  playerId: string;
  playerName: string;
  avatarSeed: string;
  input: string;
  result: 'correct' | 'wrong' | 'already_guessed' | 'timeout' | 'skip';
  matchedDisplay?: string;
}

// Animation Phasen für gestaffelte Auflösung
type RevealPhase = 'pending' | 'showing' | 'revealed';

// Timing-Konstanten für die Animation (in ms)
const REVEAL_TIMINGS = {
  PHASE_1: 600,  // "NAME sagt:" erscheint
  PHASE_2: 800,  // Begriff wird gezeigt
  PHASE_3: 1200, // Auflösung richtig/falsch
};

interface TurnIndicatorProps {
  currentTurnPlayer: { id: string; name: string; avatarSeed: string };
  isMyTurn: boolean;
  turnNumber: number;
  timerEnd: number | null;
  serverTime?: number;
  timePerTurn: number;
  answerFeedback: AnswerFeedback | null;
}

function TurnIndicatorWithFuse({
  currentTurnPlayer,
  isMyTurn,
  turnNumber,
  timerEnd,
  serverTime,
  timePerTurn,
  answerFeedback,
}: TurnIndicatorProps) {
  const { remaining } = useGameTimer(timerEnd, serverTime);
  const [revealPhase, setRevealPhase] = useState<RevealPhase>('pending');
  const lastFeedbackRef = useRef<string | null>(null);
  
  // Progress berechnen (0-100, wo 100 = voll, 0 = Zeit abgelaufen)
  const progress = timerEnd && timePerTurn > 0 
    ? Math.max(0, Math.min(100, (remaining / timePerTurn) * 100)) 
    : 100;
  
  // Farbzustände
  const isWarning = remaining <= 5 && remaining > 3;
  const isCritical = remaining <= 3 && remaining > 0;
  
  // Gestaffelte Animation starten wenn neues Feedback kommt
  useEffect(() => {
    if (!answerFeedback) {
      setRevealPhase('pending');
      lastFeedbackRef.current = null;
      return;
    }
    
    // Unique ID für dieses Feedback
    const feedbackId = `${answerFeedback.playerId}-${answerFeedback.input}-${answerFeedback.result}`;
    if (lastFeedbackRef.current === feedbackId) return;
    lastFeedbackRef.current = feedbackId;
    
    // Phase 1: "NAME sagt:" (sofort)
    setRevealPhase('pending');
    
    // Phase 2: Begriff zeigen
    const timer1 = setTimeout(() => {
      setRevealPhase('showing');
    }, REVEAL_TIMINGS.PHASE_1);
    
    // Phase 3: Auflösung
    const timer2 = setTimeout(() => {
      setRevealPhase('revealed');
    }, REVEAL_TIMINGS.PHASE_1 + REVEAL_TIMINGS.PHASE_2);
    
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [answerFeedback]);
  
  // Feedback-Farben (nur in Phase 3 sichtbar)
  const getFeedbackColor = (result: string, phase: RevealPhase) => {
    if (phase !== 'revealed') return 'border-muted bg-muted/5';
    switch (result) {
      case 'correct': return 'border-green-500/50 bg-green-500/10';
      case 'already_guessed': return 'border-orange-500/50 bg-orange-500/10';
      default: return 'border-red-500/50 bg-red-500/10';
    }
  };
  
  // Avatar Mood (nur in Phase 3 emotional)
  const getFeedbackMood = (result: string, phase: RevealPhase): 'happy' | 'sad' | 'confused' | 'angry' | 'neutral' => {
    if (phase !== 'revealed') return 'neutral';
    switch (result) {
      case 'correct': return 'happy';
      case 'already_guessed': return 'confused';
      case 'timeout': return 'angry';
      default: return 'sad';
    }
  };
  
  // Border-Farbe für Avatar (nur in Phase 3)
  const getAvatarBorder = (result: string, phase: RevealPhase) => {
    if (phase !== 'revealed') return 'border-muted';
    switch (result) {
      case 'correct': return 'border-green-500';
      case 'already_guessed': return 'border-orange-500';
      default: return 'border-red-500';
    }
  };
  
  // Text-Farbe (nur in Phase 3)
  const getTextColor = (result: string, phase: RevealPhase) => {
    if (phase !== 'revealed') return 'text-foreground';
    switch (result) {
      case 'correct': return 'text-green-400';
      case 'already_guessed': return 'text-orange-400';
      default: return 'text-red-400';
    }
  };
  
  return (
    <Card className={cn(
      'glass p-3 sm:p-4 mb-4 transition-all duration-300 overflow-hidden',
      answerFeedback 
        ? getFeedbackColor(answerFeedback.result, revealPhase)
        : isMyTurn && 'border-amber-500/50 bg-amber-500/5'
    )}>
      <div className="flex items-center gap-3">
        <AnimatePresence mode="wait">
          {answerFeedback ? (
            /* === FEEDBACK MODUS MIT GESTAFFELTER ANIMATION - ZENTRIERT === */
            <motion.div
              key="feedback"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col items-center justify-center flex-1 py-2"
            >
              {/* Avatar - Mood ändert sich in Phase 3 */}
              <div className="relative mb-3">
                <GameAvatar
                  seed={answerFeedback.avatarSeed}
                  mood={getFeedbackMood(answerFeedback.result, revealPhase)}
                  size="xl"
                  className={cn(
                    'border-3 transition-all duration-300',
                    getAvatarBorder(answerFeedback.result, revealPhase)
                  )}
                />
                {/* Ergebnis-Icon Badge - nur in Phase 3 */}
                <AnimatePresence>
                  {revealPhase === 'revealed' && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                      className={cn(
                        'absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center shadow-lg',
                        answerFeedback.result === 'correct' ? 'bg-green-500' : 
                        answerFeedback.result === 'already_guessed' ? 'bg-orange-500' : 'bg-red-500'
                      )}
                    >
                      {answerFeedback.result === 'correct' ? (
                        <Check className="w-4 h-4 text-white" />
                      ) : answerFeedback.result === 'timeout' ? (
                        <Timer className="w-4 h-4 text-white" />
                      ) : answerFeedback.result === 'skip' ? (
                        <SkipForward className="w-4 h-4 text-white" />
                      ) : (
                        <X className="w-4 h-4 text-white" />
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              
              {/* Feedback Text - gestaffelt, zentriert */}
              <div className="text-center">
                {/* Phase 1+: "NAME sagt:" */}
                <p className={cn(
                  'font-bold text-lg sm:text-xl transition-colors duration-300',
                  getTextColor(answerFeedback.result, revealPhase)
                )}>
                  {answerFeedback.playerName} sagt:
                </p>
                
                {/* Phase 2+: Begriff zeigen */}
                <div className="h-8 flex items-center justify-center">
                  {revealPhase !== 'pending' && (
                    <motion.p
                      key={revealPhase === 'revealed' && answerFeedback.result === 'correct' && answerFeedback.matchedDisplay ? 'corrected' : 'original'}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        'font-black text-xl sm:text-2xl transition-colors duration-300',
                        getTextColor(answerFeedback.result, revealPhase)
                      )}
                    >
                      {answerFeedback.result === 'timeout' ? (
                        '...'
                      ) : answerFeedback.result === 'skip' ? (
                        <span className="italic font-normal text-muted-foreground">nichts</span>
                      ) : (
                        // Phase 2 (showing): Zeige was getippt wurde
                        // Phase 3 (revealed) + correct: Zeige den echten Begriff (falls anders)
                        `"${revealPhase === 'revealed' && answerFeedback.result === 'correct' && answerFeedback.matchedDisplay 
                          ? answerFeedback.matchedDisplay 
                          : answerFeedback.input}"`
                      )}
                    </motion.p>
                  )}
                  {/* Lade-Punkte während Phase 1 */}
                  {revealPhase === 'pending' && (
                    <motion.span
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ repeat: Infinity, duration: 1 }}
                      className="text-xl text-muted-foreground"
                    >
                      ...
                    </motion.span>
                  )}
                </div>
                
                {/* Phase 3: Status-Text */}
                <div className="h-6 flex items-center justify-center">
                  <AnimatePresence>
                    {revealPhase === 'revealed' && (
                      <motion.p
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={cn(
                          'text-sm sm:text-base font-bold',
                          answerFeedback.result === 'correct' ? 'text-green-500' : 
                          answerFeedback.result === 'already_guessed' ? 'text-orange-500' : 'text-red-500'
                        )}
                      >
                        {answerFeedback.result === 'correct' ? '✓ Richtig!' : 
                         answerFeedback.result === 'already_guessed' ? '⚠ Bereits genannt!' : 
                         answerFeedback.result === 'timeout' ? '⏰ Zeit abgelaufen!' :
                         answerFeedback.result === 'skip' ? '⏭ Gepasst!' : '✗ Falsch!'}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          ) : (
            /* === NORMALER MODUS === */
            <motion.div
              key="normal"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-3 flex-1"
            >
              {/* Avatar */}
              <GameAvatar
                seed={currentTurnPlayer.avatarSeed}
                mood={isMyTurn ? 'hopeful' : 'neutral'}
                size="md"
                className={cn(
                  'border-2 shrink-0',
                  isMyTurn ? 'border-amber-500 ring-2 ring-amber-500/50' : 'border-muted'
                )}
              />
              
              {/* Text */}
              <div className="flex-1 min-w-0">
                <p className={cn(
                  'font-bold text-base sm:text-lg',
                  isMyTurn && 'text-amber-500'
                )}>
                  {isMyTurn ? 'Du bist dran!' : `${currentTurnPlayer.name} ist dran`}
                </p>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Zug #{turnNumber}
                </p>
              </div>
              
              {/* Zündschnur (rechtsbündig, füllt verfügbaren Platz) */}
              <div className="relative flex-1 max-w-[200px] sm:max-w-none h-6 ml-2">
                {/* Bombe am linken Ende (größer) */}
                <div className={cn(
                  'absolute left-0 top-1/2 -translate-y-1/2 text-xl z-20 transition-transform',
                  isCritical && 'animate-pulse scale-150'
                )}>
                  💣
                </div>
                
                {/* Schnur-Container (mit Platz für Bombe links) */}
                <div className="absolute left-7 right-0 top-1/2 -translate-y-1/2 h-3">
                  {/* Schnur-Hintergrund */}
                  <div className="absolute inset-0 rounded-full bg-muted/40 border border-muted overflow-hidden">
                    {/* Textur-Striche */}
                    {Array.from({ length: 15 }).map((_, i) => (
                      <div
                        key={i}
                        className="absolute top-0 bottom-0 w-px bg-muted-foreground/15"
                        style={{ left: `${(i + 1) * 6.25}%` }}
                      />
                    ))}
                  </div>
                  
                  {/* Verbleibende Schnur (startet rechts, schrumpft nach rechts = brennt nach links zur Bombe) */}
                  <motion.div
                    className={cn(
                      'absolute top-0 bottom-0 left-0 rounded-full',
                      isCritical 
                        ? 'bg-gradient-to-r from-orange-400 via-red-500 to-red-700' 
                        : isWarning 
                          ? 'bg-gradient-to-r from-yellow-400 via-amber-500 to-orange-600'
                          : 'bg-gradient-to-r from-yellow-400 via-amber-500 to-amber-700'
                    )}
                    style={{ width: `${progress}%` }}
                  />
                  
                  {/* Flamme am brennenden Ende (rechts, bewegt sich nach links zur Bombe) */}
                  {progress > 3 && (
                    <motion.div
                      className="absolute top-1/2 -translate-y-1/2 z-10"
                      style={{ left: `calc(${progress}% - 8px)` }}
                    >
                      <motion.div
                        animate={{ 
                          scale: [1, 1.4, 1.1, 1.3, 1],
                          rotate: [0, -5, 5, -3, 0],
                        }}
                        transition={{ repeat: Infinity, duration: 0.35, ease: 'easeInOut' }}
                        className="relative"
                      >
                        {/* Äußerer Glow */}
                        <div className={cn(
                          'absolute -inset-1 rounded-full blur-md opacity-70',
                          isCritical ? 'bg-red-500' : isWarning ? 'bg-orange-500' : 'bg-amber-500'
                        )} />
                        {/* Flammen-Kern */}
                        <div className={cn(
                          'relative w-4 h-4 rounded-full',
                          isCritical ? 'bg-orange-400' : isWarning ? 'bg-yellow-400' : 'bg-yellow-300'
                        )} />
                        {/* Heller Kern */}
                        <div className="absolute inset-1 rounded-full bg-white/80" />
                      </motion.div>
                      
                      {/* Funken (nur bei kritisch, fliegen nach links Richtung Bombe) */}
                      {isCritical && (
                        <>
                          <motion.div
                            className="absolute w-1 h-1 rounded-full bg-yellow-300"
                            animate={{
                              x: [0, -8, -12],
                              y: [0, -6, -10],
                              opacity: [1, 0.6, 0],
                            }}
                            transition={{ repeat: Infinity, duration: 0.4 }}
                          />
                          <motion.div
                            className="absolute w-1 h-1 rounded-full bg-orange-400"
                            animate={{
                              x: [0, -5, -10],
                              y: [0, -8, -14],
                              opacity: [1, 0.5, 0],
                            }}
                            transition={{ repeat: Infinity, duration: 0.5, delay: 0.15 }}
                          />
                        </>
                      )}
                    </motion.div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Card>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

/**
 * CollectiveListGame - "Sammelliste" Bonusrunden-Spieltyp
 * 
 * Spieler nennen abwechselnd Begriffe zu einem Thema.
 * Wer einen falschen Begriff nennt oder die Zeit überschreitet, scheidet aus.
 * Der letzte verbleibende Spieler gewinnt.
 */
export function CollectiveListGame() {
  const { submitBonusRoundAnswer, skipBonusRound } = useSocket();
  const { room, playerId, bonusRoundResult } = useGameStore();
  const players = usePlayers();
  
  const [inputValue, setInputValue] = useState('');
  const [lastResult, setLastResult] = useState<'correct' | 'wrong' | 'already_guessed' | null>(null);
  const lastProcessedGuessRef = useRef<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Track ob die initiale Grid-Animation bereits abgespielt wurde
  // Startet als false, wird nach dem ersten Render auf true gesetzt
  const [hasAnimatedInitialGrid, setHasAnimatedInitialGrid] = useState(false);
  
  // Popup für letzte Antwort
  const [answerPopup, setAnswerPopup] = useState<{
    playerId: string;
    playerName: string;
    avatarSeed: string;
    input: string;
    result: 'correct' | 'wrong' | 'already_guessed' | 'timeout' | 'skip';
    matchedDisplay?: string;
  } | null>(null);
  
  // Track der Reveal-Phase für Grid-Synchronisation
  const [gridRevealPhase, setGridRevealPhase] = useState<'pending' | 'showing' | 'revealed'>('pending');
  
  // Track der zuletzt gefundenen Item-IDs (für Blitz-Markierung)
  const [recentlyFoundIds, setRecentlyFoundIds] = useState<string[]>([]);

  const bonusRound = room?.bonusRound as CollectiveListBonusRound | null;
  const isMyTurn = bonusRound?.currentTurn?.playerId === playerId;
  const isIntro = bonusRound?.phase === 'intro';
  const isPlaying = bonusRound?.phase === 'playing';
  const isFinished = bonusRound?.phase === 'finished';

  // Auto-focus input when it's my turn
  useEffect(() => {
    if (isMyTurn && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isMyTurn]);

  // Clear last result after delay
  useEffect(() => {
    if (lastResult) {
      const timer = setTimeout(() => setLastResult(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [lastResult]);

  // Nach der initialen Grid-Animation den Flag setzen, damit nachfolgende Updates keine Animation mehr triggern
  useEffect(() => {
    if (bonusRound?.items && bonusRound.items.length > 0 && !hasAnimatedInitialGrid) {
      // Warte bis die gestaffelte Animation durch ist (max 1.5s + etwas Puffer)
      const timer = setTimeout(() => {
        setHasAnimatedInitialGrid(true);
      }, 1800);
      return () => clearTimeout(timer);
    }
  }, [bonusRound?.items, hasAnimatedInitialGrid]);

  // Clear answer popup after delay und synchronisiere Grid-Reveal-Phase
  const FEEDBACK_TOTAL_MS = REVEAL_TIMINGS.PHASE_1 + REVEAL_TIMINGS.PHASE_2 + REVEAL_TIMINGS.PHASE_3;
  useEffect(() => {
    if (answerPopup) {
      // Phase 1: pending (sofort)
      setGridRevealPhase('pending');
      
      // Phase 2: showing
      const timer1 = setTimeout(() => {
        setGridRevealPhase('showing');
      }, REVEAL_TIMINGS.PHASE_1);
      
      // Phase 3: revealed - JETZT darf das Grid-Item erscheinen
      const timer2 = setTimeout(() => {
        setGridRevealPhase('revealed');
      }, REVEAL_TIMINGS.PHASE_1 + REVEAL_TIMINGS.PHASE_2);
      
      // Popup ausblenden
      const timer3 = setTimeout(() => {
        setAnswerPopup(null);
        setGridRevealPhase('pending'); // Reset für nächste Runde
      }, FEEDBACK_TOTAL_MS);
      
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
        clearTimeout(timer3);
      };
    }
  }, [answerPopup]);

  // Listen for result events and add to log
  useEffect(() => {
    const guess = bonusRound?.lastGuess;
    if (!guess) return;
    
    // Create unique ID for this guess
    const guessId = `${guess.playerId}-${guess.input}-${guess.result}`;
    
    // Skip if we already processed this guess
    if (lastProcessedGuessRef.current === guessId) return;
    lastProcessedGuessRef.current = guessId;
    
    // Set personal result feedback
    if (guess.playerId === playerId) {
      if (guess.result === 'correct') {
        setLastResult('correct');
      } else if (guess.result === 'wrong') {
        setLastResult('wrong');
      } else if (guess.result === 'already_guessed') {
        setLastResult('already_guessed');
      }
    }
    
    // Zeige Popup für die letzte Antwort (für alle Spieler sichtbar)
    const player = players.find(p => p.id === guess.playerId);
    if (player) {
      setAnswerPopup({
        playerId: guess.playerId,
        playerName: player.name,
        avatarSeed: player.avatarSeed,
        input: guess.input || '',
        result: guess.result as 'correct' | 'wrong' | 'already_guessed' | 'timeout' | 'skip',
        matchedDisplay: guess.matchedDisplay,
      });
      
      // Bei korrekter Antwort: Item-ID zu recentlyFoundIds hinzufügen
      if (guess.result === 'correct' && guess.matchedDisplay) {
        const matchedItem = bonusRound?.items.find(i => i.display === guess.matchedDisplay);
        if (matchedItem) {
          setRecentlyFoundIds(prev => [matchedItem.id, ...prev].slice(0, 3));
        }
      }
    }
  }, [bonusRound?.lastGuess, playerId, players, bonusRound?.items]);

  // Check if input matches an already guessed item (exact match against display or aliases)
  const checkForDuplicate = (value: string): string | null => {
    if (!bonusRound?.items || !value.trim()) return null;
    
    const normalizedInput = value.trim().toLowerCase();
    
    for (const item of bonusRound.items) {
      if (!item.guessedBy) continue; // Not guessed yet
      
      // Exact match against display name
      if (item.display.toLowerCase() === normalizedInput) {
        return item.display;
      }
      
      // Exact match against any alias (only available for guessed items)
      if (item.aliases) {
        for (const alias of item.aliases) {
          if (alias.toLowerCase() === normalizedInput) {
            return item.display;
          }
        }
      }
    }
    
    return null;
  };

  // Update duplicate warning when input changes
  useEffect(() => {
    const duplicate = checkForDuplicate(inputValue);
    setDuplicateWarning(duplicate);
  }, [inputValue, bonusRound?.items]);

  const handleSubmit = () => {
    if (!inputValue.trim() || !isMyTurn || duplicateWarning) return;
    submitBonusRoundAnswer(inputValue.trim());
    setInputValue('');
    setDuplicateWarning(null);
  };

  const handleSkip = () => {
    if (!isMyTurn) return;
    skipBonusRound();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  // Group items for display
  const groupedItems = useMemo(() => {
    if (!bonusRound?.items) return [];
    
    // Check if items have groups
    const hasGroups = bonusRound.items.some(item => item.group);
    
    if (!hasGroups) {
      return [{ group: null, items: bonusRound.items }];
    }
    
    // Group by group field
    const groups = new Map<string, typeof bonusRound.items>();
    bonusRound.items.forEach(item => {
      const groupName = item.group || 'Andere';
      if (!groups.has(groupName)) {
        groups.set(groupName, []);
      }
      groups.get(groupName)!.push(item);
    });
    
    return Array.from(groups.entries()).map(([group, items]) => ({ group, items }));
  }, [bonusRound?.items]);

  // Current turn player info
  const currentTurnPlayer = useMemo(() => {
    if (!bonusRound?.currentTurn) return null;
    return players.find(p => p.id === bonusRound.currentTurn?.playerId);
  }, [bonusRound?.currentTurn, players]);

  // Am I eliminated?
  const amEliminated = bonusRound?.eliminatedPlayers.some(e => e.playerId === playerId);

  if (!bonusRound) return null;

  // Sort players for leaderboard (by score)
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen p-4 sm:p-6 relative"
    >
      {/* Pulsierender Rand wenn man dran ist */}
      <AnimatePresence>
        {isMyTurn && isPlaying && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 pointer-events-none z-40"
          >
            {/* Animierter Rahmen */}
            <motion.div
              animate={{
                boxShadow: [
                  'inset 0 0 20px 5px rgba(245, 158, 11, 0.3)',
                  'inset 0 0 40px 10px rgba(245, 158, 11, 0.5)',
                  'inset 0 0 20px 5px rgba(245, 158, 11, 0.3)',
                ],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className="absolute inset-0 rounded-none"
            />
            {/* Ecken-Akzente */}
            <div className="absolute top-0 left-0 w-16 h-16 border-t-4 border-l-4 border-amber-500 rounded-tl-lg" />
            <div className="absolute top-0 right-0 w-16 h-16 border-t-4 border-r-4 border-amber-500 rounded-tr-lg" />
            <div className="absolute bottom-0 left-0 w-16 h-16 border-b-4 border-l-4 border-amber-500 rounded-bl-lg" />
            <div className="absolute bottom-0 right-0 w-16 h-16 border-b-4 border-r-4 border-amber-500 rounded-br-lg" />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-6">
        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ repeat: Infinity, duration: 2, repeatDelay: 3 }}
              className="text-3xl"
            >
              {bonusRound.categoryIcon || '🎯'}
            </motion.div>
            <div>
              <p className="text-sm text-muted-foreground font-medium">
                Bonusrunde · {bonusRound.questionType || 'Liste'}
              </p>
              <p className="text-sm text-amber-500 font-bold">
                {bonusRound.category || 'Allgemeinwissen'}
              </p>
            </div>
          </div>
          
          {/* Progress */}
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Gefunden</p>
              <p className="font-mono font-bold text-lg">
                <span className="text-green-500">{bonusRound.revealedCount}</span>
                <span className="text-muted-foreground">/{bonusRound.totalItems}</span>
              </p>
            </div>
            
            {/* Timer - Server-synchronized */}
            {isPlaying && bonusRound.currentTurn && (
              <GameTimer
                timerEnd={bonusRound.currentTurn.timerEnd}
                serverTime={room?.serverTime}
                durationMs={bonusRound.timePerTurn * 1000}
                warningThreshold={5}
                criticalThreshold={3}
                variant="default"
              />
            )}
          </div>
        </div>

        {/* Intro + Playing + Finished Phase - unified flow */}
        {(isIntro || isPlaying || isFinished) && (
          <>
            {/* Big Description Card - always visible, smaller on mobile */}
            {bonusRound.description && !isFinished && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                className="mb-4 sm:mb-6"
              >
                <Card className="glass p-3 sm:p-6 border-amber-500/30 bg-amber-500/5">
                  <div className="flex items-start gap-2 sm:gap-4">
                    <motion.div
                      animate={{ rotate: [0, 10, -10, 0] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                      className="text-2xl sm:text-4xl shrink-0"
                    >
                      📋
                    </motion.div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base sm:text-xl font-bold text-amber-500 mb-1 sm:mb-2 truncate">{bonusRound.topic}</h3>
                      <p className="text-sm sm:text-lg text-foreground line-clamp-2 sm:line-clamp-none">{bonusRound.description}</p>
                      <div className="flex flex-wrap gap-1 sm:gap-2 mt-2 sm:mt-3 text-xs sm:text-sm text-muted-foreground">
                        <span className="px-1.5 sm:px-2 py-0.5 glass rounded-full">{bonusRound.totalItems} Begriffe</span>
                        <span className="px-1.5 sm:px-2 py-0.5 glass rounded-full">{bonusRound.timePerTurn}s/Zug</span>
                        <span className="px-1.5 sm:px-2 py-0.5 glass rounded-full">+{bonusRound.pointsPerCorrect}P</span>
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            )}

            {/* Intro waiting indicator */}
            {isIntro && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex justify-center mb-4"
              >
                <div className="flex items-center gap-3 px-6 py-3 glass rounded-xl">
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                    className="w-3 h-3 rounded-full bg-amber-500"
                  />
                  <span className="text-muted-foreground font-medium">Gleich geht's los...</span>
                </div>
              </motion.div>
            )}

            {/* Current Turn Indicator mit Zündschnur / Antwort-Feedback */}
            {isPlaying && currentTurnPlayer && (
              <TurnIndicatorWithFuse
                currentTurnPlayer={currentTurnPlayer}
                isMyTurn={isMyTurn}
                turnNumber={bonusRound.currentTurn?.turnNumber || 0}
                timerEnd={bonusRound.currentTurn?.timerEnd || null}
                serverTime={room?.serverTime}
                timePerTurn={bonusRound.timePerTurn}
                answerFeedback={answerPopup}
              />
            )}

            {/* Input + Items Grid Container - reversed order on mobile */}
            <div className="flex flex-col-reverse sm:flex-col gap-4">
              {/* Items Grid */}
              <Card className="glass p-3 sm:p-4">
                <div className="space-y-4 max-h-[40vh] sm:max-h-none overflow-y-auto">
                  {(() => {
                    // First pass: calculate visible items for all groups
                    const allVisibleItems = groupedItems.flatMap(({ items }) => {
                      const LARGE_LIST_THRESHOLD = 50;
                      const isLargeList = items.length > LARGE_LIST_THRESHOLD;
                      
                      if (isLargeList && !isFinished) {
                        const MAX_HIDDEN_SHOWN = 50;
                        const revealedItems = items.filter(item => !!item.guessedBy);
                        const hiddenItems = items.filter(item => !item.guessedBy);
                        const hiddenToShow = hiddenItems.slice(0, Math.max(0, MAX_HIDDEN_SHOWN - revealedItems.length));
                        return [...revealedItems, ...hiddenToShow];
                      } else {
                        return items;
                      }
                    });

                    // Dynamic animation delay: Max 1.5s total for ALL items across ALL groups
                    const MAX_ANIMATION_DURATION = 1.5;
                    const delayPerItem = Math.min(0.03, MAX_ANIMATION_DURATION / Math.max(allVisibleItems.length, 1));
                    
                    // Initiale Animation nur beim ersten Render abspielen
                    const shouldAnimateInitial = !hasAnimatedInitialGrid;
                    
                    // Second pass: render with global index
                    let globalIndex = 0;
                    
                    return groupedItems.map(({ group, items }, groupIndex) => {
                      const LARGE_LIST_THRESHOLD = 50;
                      const isLargeList = items.length > LARGE_LIST_THRESHOLD;
                      
                      let visibleItems: typeof items;
                      let hiddenCount = 0;
                      
                      if (isLargeList && !isFinished) {
                        const MAX_HIDDEN_SHOWN = 50;
                        const revealedItems = items.filter(item => !!item.guessedBy);
                        const hiddenItems = items.filter(item => !item.guessedBy);
                        const hiddenToShow = hiddenItems.slice(0, Math.max(0, MAX_HIDDEN_SHOWN - revealedItems.length));
                        hiddenCount = hiddenItems.length - hiddenToShow.length;
                        visibleItems = [...revealedItems, ...hiddenToShow];
                      } else {
                        visibleItems = items;
                      }
                    
                      return (
                        <div key={group || 'all'}>
                          {group && (
                            <h4 className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                              {group}
                            </h4>
                          )}
                          <div className="flex flex-wrap gap-1.5 sm:gap-2">
                            {visibleItems.map((item, index) => {
                              // Prüfe ob dieses Item gerade im Reveal-Popup ist (noch nicht aufgedeckt zeigen)
                              const isCurrentlyRevealing = answerPopup?.result === 'correct' 
                                && answerPopup?.matchedDisplay === item.display 
                                && gridRevealPhase !== 'revealed';
                              
                              // Item ist "revealed" wenn es guessedBy hat UND nicht gerade im Reveal ist
                              const isRevealed = !!item.guessedBy && !isCurrentlyRevealing;
                              const isUnrevealedAtEnd = isFinished && !item.guessedBy;
                              const itemGlobalIndex = globalIndex++;
                              const isRecentlyFound = recentlyFoundIds?.includes(item.id);
                              
                              return (
                                <motion.div
                                  key={item.id}
                                  initial={shouldAnimateInitial ? { opacity: 0, scale: 0.8 } : false}
                                  animate={{ opacity: 1, scale: 1 }}
                                  transition={shouldAnimateInitial ? { delay: itemGlobalIndex * delayPerItem } : { duration: 0.2 }}
                                  layout
                                  className={cn(
                                    'px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all',
                                    isRevealed
                                      ? isRecentlyFound
                                        ? 'bg-green-500/30 text-green-300 border-2 border-green-400 shadow-md shadow-green-500/20'
                                        : 'bg-green-500/20 text-green-400 border border-green-500/30'
                                      : isUnrevealedAtEnd
                                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                        : 'bg-muted/50 text-muted-foreground border border-transparent'
                                  )}
                                >
                                  {isRevealed ? (
                                    <span className="flex items-center gap-1">
                                      {isRecentlyFound ? (
                                        <motion.span
                                          initial={{ scale: 0 }}
                                          animate={{ scale: 1 }}
                                          transition={{ type: 'spring', stiffness: 500 }}
                                          className="flex items-center"
                                          title="Gerade gefunden!"
                                        >
                                          <Zap className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                                        </motion.span>
                                      ) : (
                                        <Check className="w-3 h-3" />
                                      )}
                                      {item.display}
                                    </span>
                                  ) : isUnrevealedAtEnd ? (
                                    <span className="flex items-center gap-1">
                                      <X className="w-3 h-3" />
                                      {item.display}
                                    </span>
                                  ) : (
                                    <span className="opacity-50">???</span>
                                  )}
                                </motion.div>
                              );
                            })}
                          
                          {/* Show count of additional hidden items (only for large lists) */}
                          {hiddenCount > 0 && !isFinished && (
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium bg-muted/30 text-muted-foreground border border-dashed border-muted-foreground/30"
                            >
                              +{hiddenCount} weitere
                            </motion.div>
                          )}
                        </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </Card>

              {/* Input Area (only during playing phase) */}
              {isPlaying && (
                <Card className="glass p-3 sm:p-4">
                  {isMyTurn ? (
                    <div className="space-y-2 sm:space-y-3">
                      <div className="flex gap-2">
                        <input
                          ref={inputRef}
                          type="text"
                          value={inputValue}
                          onChange={(e) => setInputValue(e.target.value)}
                          onKeyDown={handleKeyDown}
                          placeholder="Deine Antwort..."
                          className={cn(
                            "flex-1 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl bg-background border outline-none text-base sm:text-lg transition-colors",
                            duplicateWarning 
                              ? "border-orange-500 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20" 
                              : "border-input focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                          )}
                          autoComplete="off"
                          autoCapitalize="off"
                        />
                        <Button
                          onClick={handleSubmit}
                          disabled={!inputValue.trim() || !!duplicateWarning}
                          className={cn(
                            "px-4 sm:px-6 font-bold",
                            duplicateWarning 
                              ? "bg-orange-500/50 text-orange-200 cursor-not-allowed"
                              : "bg-amber-500 hover:bg-amber-600 text-black"
                          )}
                        >
                          <Send className="w-5 h-5" />
                        </Button>
                      </div>
                      {/* Duplicate Warning */}
                      <AnimatePresence>
                        {duplicateWarning && (
                          <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-500/20 border border-orange-500/30 text-orange-400 text-sm"
                          >
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>
                              <strong>"{duplicateWarning}"</strong> wurde bereits genannt!
                            </span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      
                      <div className="flex justify-between items-center">
                        <p className="text-xs text-muted-foreground hidden sm:block">
                          Tippfehler werden toleriert!
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleSkip}
                          className="text-muted-foreground hover:text-red-500 text-xs sm:text-sm ml-auto"
                        >
                          <SkipForward className="w-4 h-4 mr-1" />
                          Passen
                        </Button>
                      </div>
                    </div>
                  ) : amEliminated ? (
                    <div className="text-center py-3 sm:py-4">
                      <X className="w-6 sm:w-8 h-6 sm:h-8 text-red-500 mx-auto mb-2" />
                      <p className="text-muted-foreground text-sm sm:text-base">Du bist ausgeschieden</p>
                      <p className="text-xs text-muted-foreground mt-1 hidden sm:block">Schau zu, wie es weitergeht!</p>
                    </div>
                  ) : (
                    <div className="text-center py-3 sm:py-4">
                      <motion.div
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ repeat: Infinity, duration: 1.5 }}
                        className="text-muted-foreground text-sm sm:text-base"
                      >
                        Warte auf {currentTurnPlayer?.name}...
                      </motion.div>
                    </div>
                  )}
                </Card>
              )}
            </div>

            {/* Finished State */}
            {isFinished && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 space-y-4"
              >
                {/* Header Card */}
                <Card className="glass p-6 text-center border-amber-500/20">
                  <div className="inline-flex items-center justify-center p-3 rounded-full bg-amber-500/10 mb-4">
                    <Trophy className="w-8 h-8 text-amber-500" />
                  </div>
                  <h3 className="text-2xl font-bold mb-2">Runde beendet!</h3>
                  <p className="text-muted-foreground mb-4">
                    Insgesamt <span className="text-green-500 font-bold">{bonusRound.revealedCount}</span> Begriffe gefunden
                  </p>
                  
                  {/* Winners */}
                  <div className="flex flex-wrap gap-2 justify-center mb-2">
                    {bonusRound.eliminatedPlayers
                      .filter(e => e.rank === 1)
                      .map((winner) => (
                        <div key={winner.playerId} className="flex flex-col items-center">
                          <GameAvatar seed={winner.avatarSeed} mood="superHappy" size="lg" className="border-4 border-amber-500 shadow-xl" />
                          <div className="mt-2 px-3 py-1 bg-amber-500 text-black font-bold rounded-full text-sm flex items-center gap-1">
                            <Crown className="w-3 h-3" />
                            {winner.playerName}
                          </div>
                        </div>
                      ))}
                  </div>
                </Card>

                {/* Compact Score Breakdown */}
                {bonusRoundResult && bonusRoundResult.playerScoreBreakdown.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    <Card className="glass overflow-hidden">
                      <div className="p-3 bg-muted/30 border-b border-white/5 flex justify-between items-center">
                        <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
                          Ergebnisse
                        </h4>
                        <span className="text-xs text-muted-foreground">Punkte dieser Runde</span>
                      </div>
                      <div className="divide-y divide-white/5">
                        {bonusRoundResult.playerScoreBreakdown.map((score, index) => {
                          const isMe = score.playerId === playerId;
                          const isWinner = score.rank === 1;
                          
                          return (
                            <div 
                              key={score.playerId}
                              className={cn(
                                'flex items-center gap-3 p-3 sm:p-4 hover:bg-white/5 transition-colors',
                                isWinner && 'bg-amber-500/5'
                              )}
                            >
                              {/* Rank */}
                              <div className={cn(
                                'w-8 h-8 flex items-center justify-center font-bold rounded-full shrink-0 text-sm',
                                isWinner ? 'bg-amber-500 text-black' : 'bg-muted text-muted-foreground'
                              )}>
                                {score.rank}
                              </div>

                              {/* Player */}
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <GameAvatar seed={score.avatarSeed} size="xs" />
                                <div className="flex flex-col">
                                  <span className={cn("font-bold truncate text-sm sm:text-base", isMe && "text-primary")}>
                                    {score.playerName}
                                  </span>
                                  {score.correctAnswers > 0 && (
                                    <span className="text-xs text-green-500 font-medium">
                                      {score.correctAnswers} Begriffe gefunden
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Bonuses */}
                              {score.rankBonus > 0 && (
                                <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-xs text-amber-500 font-medium shrink-0">
                                  <Trophy className="w-3 h-3" />
                                  <span>+{score.rankBonus}</span>
                                </div>
                              )}

                              {/* Total */}
                              <div className="text-right shrink-0 min-w-[60px]">
                                <span className="font-mono font-black text-lg text-primary">
                                  +{score.totalPoints}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  </motion.div>
                )}
              </motion.div>
            )}

            {/* Mobile Players Status */}
            <div className="lg:hidden mt-4">
              <Leaderboard
                compact
                highlightPlayerId={bonusRound.currentTurn?.playerId}
                eliminatedPlayerIds={bonusRound.eliminatedPlayers
                  .filter(e => e.rank > 1) // Only show real losers as eliminated
                  .map(e => e.playerId)}
                customStatus={(player) => {
                  const isCurrent = player.id === bonusRound.currentTurn?.playerId;
                  if (isCurrent) return { color: 'text-amber-500' };
                  return {};
                }}
              />
            </div>
          </>
        )}
        </div>

        {/* Desktop Sidebar - Rangliste */}
        <div className="hidden lg:block w-80">
          <div className="sticky top-6">
            <Leaderboard
              highlightPlayerId={bonusRound.currentTurn?.playerId}
              eliminatedPlayerIds={bonusRound.eliminatedPlayers
                .filter(e => e.rank > 1)
                .map(e => e.playerId)}
              customStatus={(player) => {
                const isActive = bonusRound?.activePlayers.includes(player.id);
                const isEliminated = bonusRound?.eliminatedPlayers.some(e => e.playerId === player.id && e.rank > 1);
                
                if (isActive) return { text: 'Im Spiel', color: 'text-green-500' };
                if (isEliminated) return { text: 'Ausgeschieden', color: 'text-red-500' };
                return {};
              }}
              customBadge={(player) => {
                const isCurrent = isPlaying && bonusRound?.currentTurn?.playerId === player.id;
                if (isCurrent) {
                  return (
                    <motion.div 
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ repeat: Infinity, duration: 1 }}
                      className="absolute -bottom-1 -right-1 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center"
                    >
                      <span className="text-[10px] text-black font-bold">!</span>
                    </motion.div>
                  );
                }
                return null;
              }}
            />
          </div>
        </div>
      </div>
    </motion.main>
  );
}

