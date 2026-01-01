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
  resetPlayerAnswers,
  roomToClient,
  emitPhaseChange,
  broadcastRoomUpdate,
} from '../roomStore';

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
 */
export function startQuestion(room: GameRoom, io: SocketServer): void {
  const question = room.state.roundQuestions[room.state.currentQuestionIndex];
  if (!question) {
    // No more questions - show scoreboard
    const { showScoreboard } = require('./matchFlow');
    showScoreboard(room, io);
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
  room.questionTimer = setTimeout(() => {
    if (room.state.phase === 'question') {
      showAnswer(room, io);
    } else if (room.state.phase === 'estimation') {
      showEstimationAnswer(room, io);
    }
  }, room.settings.timePerQuestion * 1000);
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
      basePoints = 1000;
      timeBonus = Math.max(0, Math.floor((player.answerTime || 0) / 100));
      streakBonus = Math.min(player.streak * 50, 250);
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
    .sort((a, b) => a.absDiff - b.absDiff);

  const results: AnswerResult[] = [];
  
  // Accuracy-based scoring system
  const rankBonuses = [300, 200, 100];
  const baseRankBonus = 50;
  const maxAccuracyPoints = 1000;
  const perfectBonusValue = 500;
  
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
      if (percentageOff <= 100) {
        accuracyPoints = Math.round(maxAccuracyPoints * (1 - percentageOff / 100));
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

