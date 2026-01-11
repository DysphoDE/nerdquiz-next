/**
 * Question Logic
 * 
 * Enthält die Logik für:
 * - Frage starten
 * - Antwort verarbeiten
 * - Punkteberechnung
 * - Multiple Choice und Schätzfragen
 */

import type { Server as SocketServer } from 'socket.io';
import type { GameRoom, AnswerResult, PlayerGameStats } from '../types';
import { createInitialPlayerStats } from '../types';
import {
  getRoom,
  resetPlayerAnswers,
  roomToClient,
  emitPhaseChange,
  broadcastRoomUpdate,
} from '../roomStore';
import {
  CHOICE_SCORING,
  ESTIMATION_SCORING,
} from '@/config/constants';

// ============================================
// STATISTICS HELPER
// ============================================

/**
 * Holt oder erstellt PlayerGameStats für einen Spieler
 */
function getOrCreatePlayerStats(room: GameRoom, playerId: string): PlayerGameStats {
  let stats = room.state.statistics.playerStats.get(playerId);
  if (!stats) {
    stats = createInitialPlayerStats(playerId);
    room.state.statistics.playerStats.set(playerId, stats);
  }
  return stats;
}

/**
 * Aktualisiert die Kategorie-Statistiken
 */
function updateCategoryStats(
  playerStats: PlayerGameStats,
  gameStats: GameRoom['state']['statistics'],
  category: string,
  correct: boolean
): void {
  // Player category stats
  const playerCatStats = playerStats.categoryStats.get(category) || { correct: 0, total: 0 };
  playerCatStats.total++;
  if (correct) playerCatStats.correct++;
  playerStats.categoryStats.set(category, playerCatStats);

  // Global category performance
  const globalCatStats = gameStats.categoryPerformance.get(category) || { correct: 0, total: 0 };
  globalCatStats.total++;
  if (correct) globalCatStats.correct++;
  gameStats.categoryPerformance.set(category, globalCatStats);
}

// ============================================
// START QUESTION
// ============================================

/**
 * Startet die nächste Frage
 * 
 * @throws Wirft keine Errors - alle Fehler werden intern behandelt
 */
export async function startQuestion(room: GameRoom, io: SocketServer): Promise<void> {
  try {
    let question = room.state.roundQuestions[room.state.currentQuestionIndex];

    // Check if we need to load more questions (Endless Mode)
    const isEndlessMode = room.isEndlessMode === true;
    const endlessCategoryId = room.endlessCategoryId;

    if (!question && isEndlessMode && endlessCategoryId) {
      try {
        // Load more questions for endless mode
        const { getQuestionsForRoom } = await import('./categorySelection');
        console.log('♾️ Endless mode: Loading more questions...');

        const newQuestions = await getQuestionsForRoom(room, endlessCategoryId, 50);
        if (newQuestions.length > 0) {
          room.state.roundQuestions = newQuestions;
          room.state.currentQuestionIndex = 0;
          question = newQuestions[0];

          io.to(room.code).emit('dev_notification', {
            message: `♾️ ${newQuestions.length} neue Fragen geladen`
          });
        }
      } catch (loadError) {
        console.error(`❌ Error loading endless mode questions for room ${room.code}:`, loadError);
        // Fallback: End endless mode and show scoreboard
        room.isEndlessMode = false;
        io.to(room.code).emit('error_notification', {
          message: 'Fehler beim Laden weiterer Fragen. Beende Endless Mode...'
        });
      }
    }

    if (!question) {
      // No more questions - show scoreboard
      const { showScoreboard } = require('./matchFlow');
      showScoreboard(room, io);
      return;
    }

    // Validate question data
    if (!validateQuestionData(question)) {
      console.error(`❌ Invalid question data in room ${room.code}:`, question);
      // Skip to next question or scoreboard
      room.state.currentQuestionIndex++;
      if (room.state.currentQuestionIndex < room.state.roundQuestions.length) {
        // Try next question
        await startQuestion(room, io);
      } else {
        // No more questions, show scoreboard
        const { showScoreboard } = require('./matchFlow');
        showScoreboard(room, io);
      }
      return;
    }

    // Reset all player answers
    resetPlayerAnswers(room);

    room.state.phase = question.type === 'estimation' ? 'estimation' : 'question';
    room.state.currentQuestion = question;
    room.state.showingCorrectAnswer = false;
    room.state.timerEnd = Date.now() + (room.settings.timePerQuestion * 1000);

    emitPhaseChange(room, io, room.state.phase);
    broadcastRoomUpdate(room, io);

    // Set timeout for auto-reveal
    // RACE CONDITION FIX: Capture expected phase to prevent double-reveal
    const roomCode = room.code;
    const questionIndex = room.state.currentQuestionIndex;
    const expectedPhase = room.state.phase; // 'question' or 'estimation'

    room.questionTimer = setTimeout(() => {
      const currentRoom = getRoom(roomCode);
      if (!currentRoom) return;

      // Guard against race condition: Check BOTH questionIndex AND phase
      // If phase already changed to 'revealing' or 'estimation_reveal', skip
      if (currentRoom.state.currentQuestionIndex !== questionIndex) return;
      if (currentRoom.state.phase !== expectedPhase) {
        console.log(`⏱️ Timer skipped: phase already changed from ${expectedPhase} to ${currentRoom.state.phase}`);
        return;
      }

      if (expectedPhase === 'question') {
        showAnswer(currentRoom, io);
      } else if (expectedPhase === 'estimation') {
        showEstimationAnswer(currentRoom, io);
      }
    }, room.settings.timePerQuestion * 1000);

  } catch (error) {
    console.error(`❌ Critical error in startQuestion for room ${room.code}:`, error);
    
    // Emergency fallback: Show scoreboard
    try {
      const { showScoreboard } = require('./matchFlow');
      showScoreboard(room, io);
      
      io.to(room.code).emit('error_notification', {
        message: 'Ein technisches Problem ist aufgetreten. Überspringe zur Auswertung...'
      });
    } catch (fallbackError) {
      console.error(`❌ Critical: Even fallback failed for room ${room.code}:`, fallbackError);
    }
  }
}

/**
 * Validiert Frage-Daten auf Vollständigkeit
 */
function validateQuestionData(question: any): boolean {
  if (!question || !question.text || !question.type) {
    return false;
  }

  // Validate multiple choice questions
  if (question.type === 'choice') {
    if (!question.answers || !Array.isArray(question.answers) || question.answers.length === 0) {
      console.warn(`⚠️ Invalid choice question: Missing or empty answers array`);
      return false;
    }
    if (typeof question.correctIndex !== 'number' || question.correctIndex < 0 || question.correctIndex >= question.answers.length) {
      console.warn(`⚠️ Invalid choice question: Invalid correctIndex`);
      return false;
    }
  }

  // Validate estimation questions
  if (question.type === 'estimation') {
    if (typeof question.correctValue !== 'number') {
      console.warn(`⚠️ Invalid estimation question: Missing or invalid correctValue`);
      return false;
    }
  }

  return true;
}

// ============================================
// ANSWER HANDLING
// ============================================

/**
 * Verarbeitet eine Multiple Choice Antwort
 */
export function handleAnswer(room: GameRoom, io: SocketServer, playerId: string, answerIndex: number): void {
  if (room.state.phase !== 'question') return;

  const player = room.players.get(playerId);
  if (!player || player.currentAnswer !== null) return;

  player.currentAnswer = answerIndex;
  player.answerTime = room.state.timerEnd ? room.state.timerEnd - Date.now() : 0;

  broadcastRoomUpdate(room, io);
  io.to(room.code).emit('player_answered', {
    playerId: playerId,
    playerName: player.name
  });

  // Check if all players have answered
  const allAnswered = Array.from(room.players.values()).every(
    p => p.currentAnswer !== null || !p.isConnected
  );
  if (allAnswered) {
    if (room.questionTimer) {
      clearTimeout(room.questionTimer);
    }
    showAnswer(room, io);
  }
}

/**
 * Verarbeitet eine Schätzfragen-Antwort
 */
export function handleEstimation(room: GameRoom, io: SocketServer, playerId: string, value: number): void {
  if (room.state.phase !== 'estimation') return;

  const player = room.players.get(playerId);
  if (!player || player.estimationAnswer !== null) return;

  player.estimationAnswer = value;
  player.answerTime = room.state.timerEnd ? room.state.timerEnd - Date.now() : 0;

  broadcastRoomUpdate(room, io);
  io.to(room.code).emit('player_answered', {
    playerId: playerId,
    playerName: player.name
  });

  // Check if all players have answered
  const allAnswered = Array.from(room.players.values()).every(
    p => p.estimationAnswer !== null || !p.isConnected
  );
  if (allAnswered) {
    if (room.questionTimer) {
      clearTimeout(room.questionTimer);
    }
    showEstimationAnswer(room, io);
  }
}

// ============================================
// ANSWER REVEAL - MULTIPLE CHOICE
// ============================================

/**
 * Zeigt die Antwort für Multiple Choice Fragen
 */
export function showAnswer(room: GameRoom, io: SocketServer): void {
  room.state.phase = 'revealing';
  room.state.showingCorrectAnswer = true;
  room.state.timerEnd = null;

  const question = room.state.currentQuestion;
  if (!question) return;

  // Collect all players with their answer times for ordering
  const playerAnswers = Array.from(room.players.values()).map(player => ({
    player,
    answerTime: player.answerTime,
    hasAnswered: player.currentAnswer !== null,
  }));

  // Sort by answer time (highest = fastest, answered first) to get order
  const sortedByTime = [...playerAnswers]
    .filter(p => p.hasAnswered)
    .sort((a, b) => (b.answerTime || 0) - (a.answerTime || 0));

  // Create order map (1 = first to answer)
  const answerOrderMap = new Map<string, number>();
  sortedByTime.forEach((entry, index) => {
    answerOrderMap.set(entry.player.id, index + 1);
  });

  const results: AnswerResult[] = [];

  // Track total questions
  room.state.statistics.totalQuestions++;

  room.players.forEach((player) => {
    const correct = player.currentAnswer === question.correctIndex;
    const hasAnswered = player.currentAnswer !== null;
    let basePoints = 0;
    let timeBonus = 0;
    let streakBonus = 0;

    if (correct) {
      basePoints = CHOICE_SCORING.BASE_POINTS;
      timeBonus = Math.max(0, Math.floor((player.answerTime || 0) / CHOICE_SCORING.TIME_BONUS_DIVISOR));
      streakBonus = Math.min(player.streak * CHOICE_SCORING.STREAK_MULTIPLIER, CHOICE_SCORING.MAX_STREAK_BONUS);
      player.streak++;
    } else {
      player.streak = 0;
    }

    const points = basePoints + timeBonus + streakBonus;
    player.score += points;

    // Update player statistics
    const playerStats = getOrCreatePlayerStats(room, player.id);
    if (hasAnswered) {
      playerStats.totalAnswers++;
      if (correct) playerStats.correctAnswers++;

      // Track fastest answer and average response time
      const responseTime = player.answerTime
        ? room.settings.timePerQuestion * 1000 - player.answerTime
        : null;
      if (responseTime !== null) {
        if (playerStats.fastestAnswer === null || responseTime < playerStats.fastestAnswer) {
          playerStats.fastestAnswer = responseTime;
        }
        // Track for average calculation
        playerStats.totalResponseTime += responseTime;
        playerStats.responsesCount++;
      }

      // Track longest streak
      if (player.streak > playerStats.longestStreak) {
        playerStats.longestStreak = player.streak;
      }

      // Update category stats
      updateCategoryStats(playerStats, room.state.statistics, question.category, correct);
    }

    results.push({
      playerId: player.id,
      playerName: player.name,
      avatarSeed: player.avatarSeed,
      correct,
      points,
      basePoints,
      timeBonus,
      streakBonus,
      streak: player.streak,
      newScore: player.score,
      answer: player.currentAnswer ?? undefined,
      answerOrder: answerOrderMap.get(player.id) || null,
      responseTimeMs: player.answerTime
        ? room.settings.timePerQuestion * 1000 - player.answerTime
        : null,
    });
  });

  // Sort by answer order for animation (null = didn't answer, goes last)
  results.sort((a, b) => {
    if (a.answerOrder === null && b.answerOrder === null) return 0;
    if (a.answerOrder === null) return 1;
    if (b.answerOrder === null) return -1;
    return a.answerOrder - b.answerOrder;
  });

  io.to(room.code).emit('answer_reveal', {
    correctIndex: question.correctIndex,
    results,
  });
  broadcastRoomUpdate(room, io);
}

// ============================================
// ANSWER REVEAL - ESTIMATION
// ============================================

/**
 * Zeigt die Antwort für Schätzfragen
 */
export function showEstimationAnswer(room: GameRoom, io: SocketServer): void {
  room.state.phase = 'estimation_reveal';
  room.state.showingCorrectAnswer = true;
  room.state.timerEnd = null;

  const question = room.state.currentQuestion;
  if (!question || question.correctValue === undefined) return;

  const correctValue = question.correctValue;

  // Collect answer times for ordering
  const playerAnswerTimes = Array.from(room.players.values())
    .filter(p => p.estimationAnswer !== null)
    .sort((a, b) => (b.answerTime || 0) - (a.answerTime || 0));

  const answerOrderMap = new Map<string, number>();
  playerAnswerTimes.forEach((player, index) => {
    answerOrderMap.set(player.id, index + 1);
  });

  // Calculate differences and sort (best first for results)
  const playerEstimates = Array.from(room.players.values())
    .map(p => ({
      player: p,
      estimation: p.estimationAnswer,
      diff: p.estimationAnswer !== null
        ? p.estimationAnswer - correctValue
        : null,
      absDiff: p.estimationAnswer !== null
        ? Math.abs(p.estimationAnswer - correctValue)
        : Infinity,
    }))
    .sort((a, b) => {
      // Primary sort: by accuracy (absDiff)
      if (a.absDiff !== b.absDiff) {
        return a.absDiff - b.absDiff;
      }
      // Tiebreaker: faster answer wins (lower answerTime = faster)
      const timeA = a.player.answerTime ?? Infinity;
      const timeB = b.player.answerTime ?? Infinity;
      return timeA - timeB;
    });

  const results: AnswerResult[] = [];

  // Accuracy-based scoring system (using constants)
  const rankBonuses = ESTIMATION_SCORING.RANK_BONUSES;
  const baseRankBonus = ESTIMATION_SCORING.BASE_RANK_BONUS;
  const maxAccuracyPoints = ESTIMATION_SCORING.MAX_ACCURACY_POINTS;
  const perfectBonusValue = ESTIMATION_SCORING.PERFECT_BONUS;

  // Track total questions
  room.state.statistics.totalQuestions++;

  playerEstimates.forEach((entry, index) => {
    let accuracyPoints = 0;
    let rankBonus = 0;
    let perfect = 0;
    const hasAnswered = entry.estimation !== null;

    if (hasAnswered) {
      // Calculate percentage deviation
      const percentageOff = (entry.absDiff / Math.max(Math.abs(correctValue), 1)) * 100;

      // Accuracy points: Linear scale
      if (percentageOff <= ESTIMATION_SCORING.MAX_DEVIATION_PERCENT) {
        accuracyPoints = Math.round(maxAccuracyPoints * (1 - percentageOff / ESTIMATION_SCORING.MAX_DEVIATION_PERCENT));
      } else {
        accuracyPoints = 0;
      }

      // Rank bonus
      rankBonus = index < rankBonuses.length ? rankBonuses[index] : baseRankBonus;

      // Perfect answer bonus
      if (entry.absDiff === 0) {
        perfect = perfectBonusValue;
      }

      entry.player.streak++;
    } else {
      entry.player.streak = 0;
    }

    const points = accuracyPoints + rankBonus + perfect;
    entry.player.score += points;

    // Update player statistics for estimation questions
    const playerStats = getOrCreatePlayerStats(room, entry.player.id);
    if (hasAnswered) {
      playerStats.totalAnswers++;
      playerStats.estimationQuestions++;
      playerStats.estimationPoints += points;

      // Track longest streak
      if (entry.player.streak > playerStats.longestStreak) {
        playerStats.longestStreak = entry.player.streak;
      }

      // Update category stats (count as "correct" if in top 3)
      const isGoodEstimate = index < 3;
      updateCategoryStats(playerStats, room.state.statistics, question.category, isGoodEstimate);
    }

    results.push({
      playerId: entry.player.id,
      playerName: entry.player.name,
      avatarSeed: entry.player.avatarSeed,
      correct: entry.absDiff === 0,
      points,
      basePoints: accuracyPoints,
      timeBonus: 0,
      streakBonus: rankBonus,
      streak: entry.player.streak,
      newScore: entry.player.score,
      answerOrder: answerOrderMap.get(entry.player.id) || null,
      responseTimeMs: entry.player.answerTime
        ? room.settings.timePerQuestion * 1000 - entry.player.answerTime
        : null,
      estimation: entry.estimation ?? undefined,
      diff: entry.diff ?? undefined,
      absDiff: entry.estimation !== null ? entry.absDiff : null,
      rank: index + 1,
      accuracyPoints,
      rankBonus,
      perfectBonus: perfect,
    });
  });

  emitPhaseChange(room, io, 'estimation_reveal');
  io.to(room.code).emit('answer_reveal', {
    correctValue: question.correctValue,
    unit: question.unit,
    results,
  });
  broadcastRoomUpdate(room, io);
}

// ============================================
// PROCEED AFTER REVEAL
// ============================================

/**
 * Geht zur nächsten Frage oder zum Scoreboard
 */
export function proceedAfterReveal(room: GameRoom, io: SocketServer): void {
  room.state.currentQuestionIndex++;

  if (room.state.currentQuestionIndex >= room.settings.questionsPerRound) {
    const { showScoreboard } = require('./matchFlow');
    showScoreboard(room, io);
  } else {
    startQuestion(room, io);
  }
}

