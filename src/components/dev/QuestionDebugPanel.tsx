'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Bug,
  Gauge,
  Check,
  Loader2,
  Pause,
  Play,
  Trash2,
  EyeOff,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  X,
} from 'lucide-react';
import { getSocket } from '@/lib/socket';
import { useGameStore } from '@/store/gameStore';
import { useDevMode } from '@/hooks/useDevMode';
import { cn } from '@/lib/utils';
import type { Difficulty, BonusRoundState } from '@/types/game';

// ============================================
// DIFFICULTY CONFIG
// ============================================

const DIFFICULTY_CONFIG: Record<Difficulty, { label: string; emoji: string; color: string; bgColor: string }> = {
  EASY: { label: 'Leicht', emoji: '🟢', color: 'text-green-400', bgColor: 'bg-green-500/20 border-green-500/30' },
  MEDIUM: { label: 'Mittel', emoji: '🟡', color: 'text-yellow-400', bgColor: 'bg-yellow-500/20 border-yellow-500/30' },
  HARD: { label: 'Schwer', emoji: '🔴', color: 'text-red-400', bgColor: 'bg-red-500/20 border-red-500/30' },
};

// ============================================
// MAIN COMPONENT
// ============================================

export function QuestionDebugPanel() {
  const room = useGameStore((s) => s.room);
  const playerId = useGameStore((s) => s.playerId);
  const { isDevMode } = useDevMode();
  
  const [isOpen, setIsOpen] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'delete' | 'disable' | null>(null);
  const [actionResult, setActionResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  // Local state for difficulty to update UI immediately
  const [localDifficulty, setLocalDifficulty] = useState<Difficulty | undefined>(undefined);
  
  const panelRef = useRef<HTMLDivElement>(null);

  // Listen for pause state from server
  useEffect(() => {
    const socket = getSocket();
    
    const handlePauseState = (data: { paused: boolean }) => {
      setIsPaused(data.paused);
    };
    
    socket.on('game_paused', handlePauseState);
    
    return () => {
      socket.off('game_paused', handlePauseState);
    };
  }, []);

  // Clear action result after delay
  useEffect(() => {
    if (actionResult) {
      const timer = setTimeout(() => setActionResult(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [actionResult]);

  // Get current question context
  const currentQuestion = room?.currentQuestion;
  const bonusRound = room?.bonusRound as BonusRoundState | null;
  
  // Sync local difficulty with server when question changes
  useEffect(() => {
    // For normal questions
    if (currentQuestion?.difficulty) {
      setLocalDifficulty(currentQuestion.difficulty);
    } 
    // For Hot Button bonus rounds - get difficulty from current question
    else if (bonusRound?.type === 'hot_button' && bonusRound.questions && bonusRound.currentQuestionIndex !== undefined) {
      const currentHotButtonQuestion = bonusRound.questions[bonusRound.currentQuestionIndex];
      setLocalDifficulty(currentHotButtonQuestion?.difficulty as Difficulty | undefined);
    }
    else {
      setLocalDifficulty(undefined);
    }
  }, [currentQuestion?.id, currentQuestion?.difficulty, bonusRound?.type, bonusRound?.currentQuestionIndex, bonusRound?.questions]);

  // Don't render if not in dev mode or no room
  if (!isDevMode || !room) return null;
  
  // Determine what we can edit
  // Normal questions have an ID directly
  // Collective List bonus rounds have questionId in bonusRound state
  // Hot Button bonus rounds have multiple questions, get the current one
  let questionId: string | undefined;
  if (currentQuestion?.id) {
    questionId = currentQuestion.id;
  } else if (bonusRound?.questionId) {
    // Collective List
    questionId = bonusRound.questionId;
  } else if (bonusRound?.type === 'hot_button' && bonusRound.questions && bonusRound.currentQuestionIndex !== undefined) {
    // Hot Button - get current question from array
    const currentHotButtonQuestion = bonusRound.questions[bonusRound.currentQuestionIndex];
    questionId = currentHotButtonQuestion?.id;
  }
  
  const hasEditableQuestion = !!questionId;
  const isBonusRound = room.phase === 'bonus_round';
  
  // Check if we're in a phase where pause makes sense
  const isPausablePhase = ['question', 'estimation', 'bonus_round'].includes(room.phase);
  
  // ============================================
  // ACTIONS
  // ============================================

  const sendDevCommand = (command: string, params?: any) => {
    const socket = getSocket();
    socket.emit('dev_command', { 
      roomCode: room.code, 
      playerId, 
      command, 
      params 
    });
  };

  const handlePauseToggle = () => {
    sendDevCommand(isPaused ? 'resume_game' : 'pause_game');
  };

  const updateDifficulty = async (newDifficulty: Difficulty) => {
    if (!questionId || isUpdating) return;
    
    // Update local state immediately for responsive UI
    setLocalDifficulty(newDifficulty);
    setIsUpdating(true);
    
    try {
      const response = await fetch(`/api/admin/questions/${questionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ difficulty: newDifficulty }),
      });

      if (response.ok) {
        setActionResult({ type: 'success', message: `Schwierigkeit: ${DIFFICULTY_CONFIG[newDifficulty].label}` });
      } else {
        // Revert on error
        setLocalDifficulty(currentQuestion?.difficulty);
        setActionResult({ type: 'error', message: 'Fehler beim Speichern' });
      }
    } catch (error) {
      // Revert on error
      setLocalDifficulty(currentQuestion?.difficulty);
      setActionResult({ type: 'error', message: 'Netzwerkfehler' });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDisableQuestion = async () => {
    if (!questionId || isUpdating) return;
    
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/admin/questions/${questionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: false }),
      });

      if (response.ok) {
        setActionResult({ type: 'success', message: 'Frage deaktiviert' });
        setConfirmAction(null);
      } else {
        setActionResult({ type: 'error', message: 'Fehler beim Deaktivieren' });
      }
    } catch (error) {
      setActionResult({ type: 'error', message: 'Netzwerkfehler' });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteQuestion = async () => {
    if (!questionId || isUpdating) return;
    
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/admin/questions/${questionId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setActionResult({ type: 'success', message: 'Frage gelöscht' });
        setConfirmAction(null);
      } else {
        setActionResult({ type: 'error', message: 'Fehler beim Löschen' });
      }
    } catch (error) {
      setActionResult({ type: 'error', message: 'Netzwerkfehler' });
    } finally {
      setIsUpdating(false);
    }
  };

  const openInAdminPanel = () => {
    if (!questionId) return;
    window.open(`/admin/questions/${questionId}/edit`, '_blank');
  };

  // ============================================
  // RENDER
  // ============================================

  // Use local difficulty state for immediate UI feedback
  const displayDifficulty = localDifficulty || currentQuestion?.difficulty;

  return (
    <>
      {/* Pause Overlay */}
      <AnimatePresence>
        {isPaused && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center pointer-events-none"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="flex flex-col items-center gap-4"
            >
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="w-24 h-24 rounded-full bg-yellow-500/20 border-4 border-yellow-500 flex items-center justify-center"
              >
                <Pause className="w-12 h-12 text-yellow-500" />
              </motion.div>
              <p className="text-2xl font-bold text-yellow-500">PAUSIERT</p>
              <p className="text-sm text-muted-foreground">Dev-Modus aktiv</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Debug Panel */}
      <motion.div
        ref={panelRef}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="fixed top-4 right-4 z-[100] w-64"
      >
        {/* Header */}
        <motion.button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "w-full flex items-center justify-between px-3 py-2 rounded-t-xl border transition-colors",
            isOpen ? "rounded-b-none" : "rounded-b-xl",
            isPaused 
              ? "bg-yellow-500/20 border-yellow-500/50 text-yellow-400" 
              : "bg-zinc-900/95 border-zinc-700 text-zinc-400"
          )}
        >
          <div className="flex items-center gap-2">
            <Bug className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Debug</span>
            {isPaused && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-yellow-500 text-black rounded">
                PAUSE
              </span>
            )}
          </div>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </motion.button>

        {/* Content */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-zinc-900/95 border border-t-0 border-zinc-700 rounded-b-xl overflow-hidden"
            >
              <div className="p-3 space-y-3">
                {/* Action Result Toast */}
                <AnimatePresence>
                  {actionResult && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className={cn(
                        "px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2",
                        actionResult.type === 'success' 
                          ? "bg-green-500/20 text-green-400 border border-green-500/30"
                          : "bg-red-500/20 text-red-400 border border-red-500/30"
                      )}
                    >
                      {actionResult.type === 'success' ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5" />
                      )}
                      {actionResult.message}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Pause/Resume Button */}
                {isPausablePhase && (
                  <button
                    onClick={handlePauseToggle}
                    className={cn(
                      "w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border font-medium text-sm transition-colors",
                      isPaused
                        ? "bg-green-500/20 border-green-500/50 text-green-400 hover:bg-green-500/30"
                        : "bg-yellow-500/20 border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/30"
                    )}
                  >
                    {isPaused ? (
                      <>
                        <Play className="w-4 h-4" />
                        Fortsetzen
                      </>
                    ) : (
                      <>
                        <Pause className="w-4 h-4" />
                        Pausieren
                      </>
                    )}
                  </button>
                )}

                {/* Question Info & Actions */}
                {hasEditableQuestion && (
                  <>
                    {/* Question ID */}
                    <div className="p-2 rounded-lg bg-zinc-800/50 text-xs">
                      <div className="flex items-center justify-between text-zinc-400 mb-1">
                        <span>Frage-ID</span>
                        <span className="font-mono text-zinc-500">{questionId!.slice(0, 8)}...</span>
                      </div>
                      <div className="flex items-center justify-between text-zinc-400">
                        <span>Typ</span>
                        <span className="font-mono">
                          {isBonusRound 
                            ? bonusRound?.type || 'bonus_round'
                            : currentQuestion?.type || '?'}
                        </span>
                      </div>
                    </div>

                    {/* Bonus Round Info (shown above difficulty for bonus rounds) */}
                    {isBonusRound && bonusRound && (
                      <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs">
                        <div className="flex items-center gap-2 text-amber-400 mb-1">
                          <span className="text-lg">{bonusRound.categoryIcon || '🎯'}</span>
                          <span className="font-medium">{bonusRound.topic}</span>
                        </div>
                        {bonusRound.type === 'collective_list' && (
                          <div className="flex items-center justify-between mt-1 text-amber-400/50">
                            <span>Gefunden</span>
                            <span className="font-mono">{bonusRound.revealedCount}/{bonusRound.totalItems}</span>
                          </div>
                        )}
                        {bonusRound.type === 'hot_button' && (
                          <div className="flex items-center justify-between mt-1 text-amber-400/50">
                            <span>Frage</span>
                            <span className="font-mono">{bonusRound.currentQuestionIndex + 1}/{bonusRound.totalQuestions}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Difficulty Selector */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs text-zinc-400">
                        <Gauge className="w-3.5 h-3.5" />
                        <span>Schwierigkeit</span>
                        {isUpdating && <Loader2 className="w-3 h-3 animate-spin ml-auto" />}
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(Object.entries(DIFFICULTY_CONFIG) as [Difficulty, typeof DIFFICULTY_CONFIG.EASY][]).map(
                          ([key, cfg]) => (
                            <button
                              key={key}
                              onClick={() => updateDifficulty(key)}
                              disabled={isUpdating}
                              className={cn(
                                "flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg border text-xs transition-colors",
                                displayDifficulty === key
                                  ? cfg.bgColor + " ring-1 ring-inset ring-current"
                                  : "bg-zinc-800/50 border-zinc-700 hover:bg-zinc-700/50",
                                isUpdating && "opacity-50 cursor-not-allowed"
                              )}
                            >
                              <span>{cfg.emoji}</span>
                              <span className={displayDifficulty === key ? cfg.color : "text-zinc-400"}>
                                {cfg.label}
                              </span>
                            </button>
                          )
                        )}
                      </div>
                    </div>

                    {/* Divider */}
                    <div className="border-t border-zinc-700" />

                    {/* DB Actions */}
                    <div className="space-y-1.5">
                      {/* Open in Admin */}
                      <button
                        onClick={openInAdminPanel}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800/50 border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-700/50 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Im Admin-Panel öffnen
                      </button>

                      {/* Disable Question */}
                      {confirmAction !== 'disable' ? (
                        <button
                          onClick={() => setConfirmAction('disable')}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-500/30 text-xs text-orange-400 hover:bg-orange-500/20 transition-colors"
                        >
                          <EyeOff className="w-3.5 h-3.5" />
                          Frage deaktivieren
                        </button>
                      ) : (
                        <div className="flex gap-1.5">
                          <button
                            onClick={handleDisableQuestion}
                            disabled={isUpdating}
                            className="flex-1 flex items-center justify-center gap-1 px-2 py-2 rounded-lg bg-orange-500 text-black text-xs font-medium hover:bg-orange-400 transition-colors disabled:opacity-50"
                          >
                            {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                            Ja
                          </button>
                          <button
                            onClick={() => setConfirmAction(null)}
                            className="flex-1 flex items-center justify-center gap-1 px-2 py-2 rounded-lg bg-zinc-700 text-zinc-300 text-xs hover:bg-zinc-600 transition-colors"
                          >
                            <X className="w-3 h-3" />
                            Nein
                          </button>
                        </div>
                      )}

                      {/* Delete Question */}
                      {confirmAction !== 'delete' ? (
                        <button
                          onClick={() => setConfirmAction('delete')}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400 hover:bg-red-500/20 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Frage löschen
                        </button>
                      ) : (
                        <div className="flex gap-1.5">
                          <button
                            onClick={handleDeleteQuestion}
                            disabled={isUpdating}
                            className="flex-1 flex items-center justify-center gap-1 px-2 py-2 rounded-lg bg-red-500 text-white text-xs font-medium hover:bg-red-400 transition-colors disabled:opacity-50"
                          >
                            {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                            Löschen
                          </button>
                          <button
                            onClick={() => setConfirmAction(null)}
                            className="flex-1 flex items-center justify-center gap-1 px-2 py-2 rounded-lg bg-zinc-700 text-zinc-300 text-xs hover:bg-zinc-600 transition-colors"
                          >
                            <X className="w-3 h-3" />
                            Abbrechen
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* No Question State */}
                {!hasEditableQuestion && (
                  <div className="p-3 rounded-lg bg-zinc-800/50 text-center">
                    <p className="text-xs text-zinc-500">Keine aktive Frage</p>
                    <p className="text-[10px] text-zinc-600 mt-1">Phase: {room.phase}</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  );
}

