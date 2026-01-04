/**
 * Hot Button Bonus Round Logic
 * 
 * Buzzer-Runde mit schrittweise aufgebauter Frage.
 * Spieler buzzern so schnell wie möglich und beantworten die Frage.
 * Richtige Antwort: Punkte (mit Buzzer-Speed-Bonus)
 * Falsche Antwort: -500 Punkte, andere dürfen nochmal buzzern
 */

import type { Server as SocketServer } from 'socket.io';
import type { 
  GameRoom, 
  BonusRoundConfig, 
  ServerHotButtonState,
} from '../types';
import { 
  getConnectedPlayers,
  emitPhaseChange,
  broadcastRoomUpdate,
} from '../roomStore';
import { botManager } from '../botManager';
import { checkAnswer as fuzzyCheckAnswer } from '@/lib/fuzzyMatch';

const dev = process.env.NODE_ENV !== 'production';

// ============================================
// START HOT BUTTON ROUND
// ============================================

/**
 * Startet eine Hot Button Bonusrunde
 */
export function startHotButtonRound(room: GameRoom, io: SocketServer, config: BonusRoundConfig): void {
  const roomCode = room.code;
  const questions = config.questions || config.hotButtonQuestions || [];
  
  if (questions.length === 0) {
    console.error('❌ No questions provided for Hot Button round');
    return;
  }

  // Build topic/description from questions
  const categories = [...new Set(questions.map((q: any) => q.category).filter(Boolean))];
  const topic = categories.length > 0 
    ? `Hot Button: ${categories.join(', ')}`
    : 'Hot Button Runde';
  
  const description = `${questions.length} Fragen aus verschiedenen Kategorien. Buzzere schnell für Bonus-Punkte!`;

  room.state.bonusRound = {
    type: 'hot_button',
    phase: 'intro',
    questionId: config.id,
    topic,
    description,
    category: config.category,
    categoryIcon: config.categoryIcon,
    
    questions,
    currentQuestionIndex: 0,
    
    revealedChars: 0,
    revealTimer: null,
    isFullyRevealed: false,
    
    buzzedPlayerId: null,
    buzzerTimeout: null,
    buzzerTimeoutDuration: config.buzzerTimeout || 30,
    buzzOrder: [],
    buzzTimestamps: new Map(),
    
    answerTimer: null,
    answerTimeoutDuration: config.answerTimeout || 15,
    
    attemptedPlayerIds: new Set(),
    maxRebuzzAttempts: config.maxRebuzzAttempts || 2,
    allowRebuzz: config.allowRebuzz ?? true,
    
    playerScores: new Map(),
    
    fuzzyThreshold: config.fuzzyThreshold || 0.85,
  };

  room.state.phase = 'bonus_round';
  emitPhaseChange(room, io, 'bonus_round');
  broadcastRoomUpdate(room, io);

  console.log(`⚡ Hot Button Round started: ${topic}`);
  console.log(`   ${questions.length} questions, ${config.buzzerTimeout || 30}s buzzer timeout`);

  // After intro, start first question
  setTimeout(() => {
    const { getRoom } = require('../roomStore');
    const currentRoom = getRoom(roomCode);
    if (currentRoom?.state.bonusRound && currentRoom.state.bonusRound.type === 'hot_button' && currentRoom.state.bonusRound.phase === 'intro') {
      startNextQuestion(currentRoom, io);
    }
  }, 3000);
}

// ============================================
// QUESTION MANAGEMENT
// ============================================

/**
 * Startet die nächste Frage
 */
function startNextQuestion(room: GameRoom, io: SocketServer): void {
  const hotButton = room.state.bonusRound;
  if (!hotButton || hotButton.type !== 'hot_button') return;

  const currentQuestion = hotButton.questions[hotButton.currentQuestionIndex];
  if (!currentQuestion) {
    endHotButtonRound(room, io);
    return;
  }

  // Reset state for new question
  hotButton.phase = 'question_reveal';
  hotButton.revealedChars = 0;
  hotButton.isFullyRevealed = false;
  hotButton.buzzedPlayerId = null;
  hotButton.buzzOrder = [];
  hotButton.buzzTimestamps.clear();
  hotButton.attemptedPlayerIds = new Set();
  hotButton.lastAnswer = undefined;
  
  if (hotButton.revealTimer) {
    clearInterval(hotButton.revealTimer);
  }
  if (hotButton.buzzerTimeout) {
    clearTimeout(hotButton.buzzerTimeout);
  }

  console.log(`❓ Hot Button Question ${hotButton.currentQuestionIndex + 1}/${hotButton.questions.length}`);
  console.log(`   "${currentQuestion.text}"`);

  broadcastRoomUpdate(room, io);
  startQuestionReveal(room, io, currentQuestion);
  
  // Notify bots
  if (dev) {
    botManager.onHotButtonQuestionStart(room.code);
  }
}

/**
 * Startet die schrittweise Enthüllung der Frage
 */
function startQuestionReveal(room: GameRoom, io: SocketServer, question: any): void {
  const hotButton = room.state.bonusRound;
  if (!hotButton || hotButton.type !== 'hot_button') return;

  const revealSpeed = question.revealSpeed || 50; // ms per character
  const roomCode = room.code;
  const questionStartTime = Date.now();

  // Start buzzer timeout
  room.state.timerEnd = Date.now() + (hotButton.buzzerTimeoutDuration * 1000);
  
  hotButton.revealTimer = setInterval(() => {
    const { getRoom } = require('../roomStore');
    const currentRoom = getRoom(roomCode);
    const hb = currentRoom?.state.bonusRound;
    
    if (!hb || hb.type !== 'hot_button' || hb.phase !== 'question_reveal') {
      if (hb && hb.type === 'hot_button' && hb.revealTimer) {
        clearInterval(hb.revealTimer);
      }
      return;
    }

    hb.revealedChars++;
    
    // Check if fully revealed
    if (hb.revealedChars >= question.text.length) {
      clearInterval(hb.revealTimer!);
      hb.revealTimer = null;
      hb.isFullyRevealed = true;
    }

    broadcastRoomUpdate(currentRoom, io);
  }, revealSpeed);

  hotButton.buzzerTimeout = setTimeout(() => {
    const { getRoom } = require('../roomStore');
    const currentRoom = getRoom(roomCode);
    if (currentRoom?.state.bonusRound && currentRoom.state.bonusRound.type === 'hot_button' && currentRoom.state.bonusRound.phase === 'question_reveal') {
      handleBuzzerTimeout(currentRoom, io);
    }
  }, hotButton.buzzerTimeoutDuration * 1000);
}

// ============================================
// BUZZER HANDLING
// ============================================

/**
 * Verarbeitet einen Buzzer
 */
export function handleHotButtonBuzz(room: GameRoom, io: SocketServer, playerId: string): void {
  const hotButton = room.state.bonusRound;
  if (!hotButton || hotButton.type !== 'hot_button') return;

  // Only allow buzz during question_reveal phase
  if (hotButton.phase !== 'question_reveal') {
    console.log(`⚠️ Player ${playerId} tried to buzz in wrong phase: ${hotButton.phase}`);
    return;
  }

  // Check if player already attempted
  if (hotButton.attemptedPlayerIds.has(playerId)) {
    console.log(`⚠️ Player ${playerId} already attempted this question`);
    return;
  }

  const player = room.players.get(playerId);
  if (!player) return;

  const buzzTime = Date.now();

  console.log(`🔔 ${player.name} buzzed! (${hotButton.revealedChars}/${hotButton.questions[hotButton.currentQuestionIndex].text.length} chars revealed)`);

  // Stop reveal
  if (hotButton.revealTimer) {
    clearInterval(hotButton.revealTimer);
    hotButton.revealTimer = null;
  }

  // Stop buzzer timeout
  if (hotButton.buzzerTimeout) {
    clearTimeout(hotButton.buzzerTimeout);
    hotButton.buzzerTimeout = null;
  }

  hotButton.buzzedPlayerId = playerId;
  hotButton.buzzOrder.push(playerId);
  hotButton.buzzTimestamps.set(playerId, buzzTime);
  hotButton.phase = 'answering';

  // Set answer timer
  room.state.timerEnd = Date.now() + (hotButton.answerTimeoutDuration * 1000);
  
  const roomCode = room.code;
  hotButton.answerTimer = setTimeout(() => {
    const { getRoom } = require('../roomStore');
    const currentRoom = getRoom(roomCode);
    if (currentRoom?.state.bonusRound && currentRoom.state.bonusRound.type === 'hot_button' && currentRoom.state.bonusRound.phase === 'answering') {
      handleAnswerTimeout(currentRoom, io, playerId);
    }
  }, hotButton.answerTimeoutDuration * 1000);

  io.to(room.code).emit('hot_button_buzz', {
    playerId,
    playerName: player.name,
    timerEnd: room.state.timerEnd,
  });

  broadcastRoomUpdate(room, io);
}

// ============================================
// ANSWER HANDLING
// ============================================

/**
 * Verarbeitet eine Antwort in der Hot Button Runde
 */
export function handleHotButtonAnswer(room: GameRoom, io: SocketServer, playerId: string, answer: string): void {
  const hotButton = room.state.bonusRound;
  if (!hotButton || hotButton.type !== 'hot_button') return;

  if (hotButton.phase !== 'answering' || hotButton.buzzedPlayerId !== playerId) {
    console.log(`⚠️ Invalid answer from ${playerId}`);
    return;
  }

  // Clear answer timer
  if (hotButton.answerTimer) {
    clearTimeout(hotButton.answerTimer);
    hotButton.answerTimer = null;
  }

  const player = room.players.get(playerId);
  if (!player) return;

  const currentQuestion = hotButton.questions[hotButton.currentQuestionIndex];
  
  // Check answer using fuzzy matching
  const correctAnswers = currentQuestion.acceptedAnswers.map((ans: string) => ({
    id: ans,
    display: ans,
    aliases: [ans],
  }));

  const result = fuzzyCheckAnswer(answer, correctAnswers, new Set(), hotButton.fuzzyThreshold);

  hotButton.attemptedPlayerIds.add(playerId);
  hotButton.phase = 'result';

  if (result.isMatch) {
    // CORRECT!
    
    // Calculate speed bonus (0-500 points based on how quickly they buzzed)
    const buzzTime = hotButton.buzzTimestamps.get(playerId) || Date.now();
    const questionText = currentQuestion.text;
    const revealedPercent = hotButton.revealedChars / questionText.length;
    
    // Earlier buzz = more bonus
    // 0-25% revealed: +500 bonus
    // 25-50%: +300 bonus
    // 50-75%: +150 bonus
    // 75-100%: +50 bonus
    let speedBonus = 0;
    if (revealedPercent <= 0.25) speedBonus = 500;
    else if (revealedPercent <= 0.50) speedBonus = 300;
    else if (revealedPercent <= 0.75) speedBonus = 150;
    else speedBonus = 50;
    
    const basePoints = currentQuestion.pointsCorrect;
    const totalPoints = basePoints + speedBonus;
    
    player.score += totalPoints;
    
    const currentScore = hotButton.playerScores.get(playerId) || 0;
    hotButton.playerScores.set(playerId, currentScore + totalPoints);

    hotButton.lastAnswer = {
      playerId,
      playerName: player.name,
      input: answer,
      correct: true,
      confidence: result.confidence,
    };

    console.log(`✅ ${player.name} CORRECT! +${totalPoints} (${basePoints} base + ${speedBonus} speed bonus)`);

    io.to(room.code).emit('hot_button_answer_result', {
      playerId,
      playerName: player.name,
      answer,
      correct: true,
      points: totalPoints,
      basePoints,
      speedBonus,
      revealedPercent: Math.round(revealedPercent * 100),
      newScore: player.score,
      confidence: result.confidence,
    });

    broadcastRoomUpdate(room, io);

    // Move to next question after delay
    const roomCode = room.code;
    setTimeout(() => {
      const { getRoom } = require('../roomStore');
      const currentRoom = getRoom(roomCode);
      if (currentRoom?.state.bonusRound && currentRoom.state.bonusRound.type === 'hot_button') {
        currentRoom.state.bonusRound.currentQuestionIndex++;
        startNextQuestion(currentRoom, io);
      }
    }, 3000);

  } else {
    // WRONG!
    const points = currentQuestion.pointsWrong;
    player.score += points; // Add negative points (-500)
    
    const currentScore = hotButton.playerScores.get(playerId) || 0;
    hotButton.playerScores.set(playerId, currentScore + points);

    hotButton.lastAnswer = {
      playerId,
      playerName: player.name,
      input: answer,
      correct: false,
      confidence: result.confidence,
    };

    console.log(`❌ ${player.name} WRONG! ${points} points (correct: ${currentQuestion.correctAnswer})`);

    io.to(room.code).emit('hot_button_answer_result', {
      playerId,
      playerName: player.name,
      answer,
      correct: false,
      points,
      correctAnswer: currentQuestion.correctAnswer,
      newScore: player.score,
      confidence: result.confidence,
    });

    broadcastRoomUpdate(room, io);

    // Check if others can rebuzz
    const remainingAttempts = hotButton.maxRebuzzAttempts - hotButton.attemptedPlayerIds.size;
    
    if (hotButton.allowRebuzz && remainingAttempts > 0) {
      // Allow rebuzz
      console.log(`   ${remainingAttempts} rebuzz attempts remaining`);
      
      const roomCode = room.code;
      setTimeout(() => {
        const { getRoom } = require('../roomStore');
        const currentRoom = getRoom(roomCode);
        if (currentRoom?.state.bonusRound && currentRoom.state.bonusRound.type === 'hot_button') {
          currentRoom.state.bonusRound.phase = 'question_reveal';
          currentRoom.state.bonusRound.buzzedPlayerId = null;
          
          // Continue reveal if not fully revealed
          const hb = currentRoom.state.bonusRound;
          const q = hb.questions[hb.currentQuestionIndex];
          if (!hb.isFullyRevealed && hb.revealedChars < q.text.length) {
            startQuestionReveal(currentRoom, io, q);
          } else {
            // Already fully revealed, just restart buzzer
            startBuzzerPhase(currentRoom, io);
          }
          
          // Notify bots
          if (dev) {
            botManager.onHotButtonRebuzz(roomCode);
          }
        }
      }, 2500);
    } else {
      // No more attempts, move to next question
      console.log(`   No more attempts, moving to next question`);
      
      const roomCode = room.code;
      setTimeout(() => {
        const { getRoom } = require('../roomStore');
        const currentRoom = getRoom(roomCode);
        if (currentRoom?.state.bonusRound && currentRoom.state.bonusRound.type === 'hot_button') {
          currentRoom.state.bonusRound.currentQuestionIndex++;
          startNextQuestion(currentRoom, io);
        }
      }, 3000);
    }
  }
}

/**
 * Startet die Buzzer-Phase (ohne Reveal)
 */
function startBuzzerPhase(room: GameRoom, io: SocketServer): void {
  const hotButton = room.state.bonusRound;
  if (!hotButton || hotButton.type !== 'hot_button') return;

  const roomCode = room.code;
  room.state.timerEnd = Date.now() + (hotButton.buzzerTimeoutDuration * 1000);
  
  hotButton.buzzerTimeout = setTimeout(() => {
    const { getRoom } = require('../roomStore');
    const currentRoom = getRoom(roomCode);
    if (currentRoom?.state.bonusRound && currentRoom.state.bonusRound.type === 'hot_button' && currentRoom.state.bonusRound.phase === 'question_reveal') {
      handleBuzzerTimeout(currentRoom, io);
    }
  }, hotButton.buzzerTimeoutDuration * 1000);

  broadcastRoomUpdate(room, io);
}

// ============================================
// TIMEOUT HANDLING
// ============================================

/**
 * Niemand hat gebuzzert
 */
function handleBuzzerTimeout(room: GameRoom, io: SocketServer): void {
  const hotButton = room.state.bonusRound;
  if (!hotButton || hotButton.type !== 'hot_button') return;

  console.log(`⏰ Buzzer timeout - no one buzzed`);

  // Fully reveal the question
  const currentQuestion = hotButton.questions[hotButton.currentQuestionIndex];
  hotButton.revealedChars = currentQuestion.text.length;
  hotButton.isFullyRevealed = true;
  hotButton.phase = 'result';
  
  if (hotButton.revealTimer) {
    clearInterval(hotButton.revealTimer);
    hotButton.revealTimer = null;
  }

  io.to(room.code).emit('hot_button_timeout', {
    reason: 'buzzer',
    correctAnswer: currentQuestion.correctAnswer,
  });

  broadcastRoomUpdate(room, io);

  // Move to next question
  const roomCode = room.code;
  setTimeout(() => {
    const { getRoom } = require('../roomStore');
    const currentRoom = getRoom(roomCode);
    if (currentRoom?.state.bonusRound && currentRoom.state.bonusRound.type === 'hot_button') {
      currentRoom.state.bonusRound.currentQuestionIndex++;
      startNextQuestion(currentRoom, io);
    }
  }, 3000);
}

/**
 * Spieler hat nicht rechtzeitig geantwortet
 */
function handleAnswerTimeout(room: GameRoom, io: SocketServer, playerId: string): void {
  const hotButton = room.state.bonusRound;
  if (!hotButton || hotButton.type !== 'hot_button') return;

  const player = room.players.get(playerId);
  console.log(`⏰ ${player?.name} failed to answer in time`);

  hotButton.attemptedPlayerIds.add(playerId);
  hotButton.phase = 'result';
  
  const currentQuestion = hotButton.questions[hotButton.currentQuestionIndex];
  
  hotButton.lastAnswer = {
    playerId,
    playerName: player?.name || 'Unknown',
    input: '',
    correct: false,
  };

  io.to(room.code).emit('hot_button_answer_result', {
    playerId,
    playerName: player?.name,
    answer: '',
    correct: false,
    points: 0,
    timeout: true,
    correctAnswer: currentQuestion.correctAnswer,
  });

  broadcastRoomUpdate(room, io);

  // Same logic as wrong answer (allow rebuzz if available)
  const remainingAttempts = hotButton.maxRebuzzAttempts - hotButton.attemptedPlayerIds.size;
  
  if (hotButton.allowRebuzz && remainingAttempts > 0) {
    const roomCode = room.code;
    setTimeout(() => {
      const { getRoom } = require('../roomStore');
      const currentRoom = getRoom(roomCode);
      if (currentRoom?.state.bonusRound && currentRoom.state.bonusRound.type === 'hot_button') {
        currentRoom.state.bonusRound.phase = 'question_reveal';
        currentRoom.state.bonusRound.buzzedPlayerId = null;
        startBuzzerPhase(currentRoom, io);
        
        if (dev) {
          botManager.onHotButtonRebuzz(roomCode);
        }
      }
    }, 2000);
  } else {
    const roomCode = room.code;
    setTimeout(() => {
      const { getRoom } = require('../roomStore');
      const currentRoom = getRoom(roomCode);
      if (currentRoom?.state.bonusRound && currentRoom.state.bonusRound.type === 'hot_button') {
        currentRoom.state.bonusRound.currentQuestionIndex++;
        startNextQuestion(currentRoom, io);
      }
    }, 2500);
  }
}

// ============================================
// END ROUND
// ============================================

/**
 * Beendet die Hot Button Runde
 */
function endHotButtonRound(room: GameRoom, io: SocketServer): void {
  const hotButton = room.state.bonusRound;
  if (!hotButton || hotButton.type !== 'hot_button') return;

  // Clear any timers
  if (hotButton.revealTimer) clearInterval(hotButton.revealTimer);
  if (hotButton.buzzerTimeout) clearTimeout(hotButton.buzzerTimeout);
  if (hotButton.answerTimer) clearTimeout(hotButton.answerTimer);

  hotButton.phase = 'finished';

  // Calculate score breakdown
  const playerScoreBreakdown = Array.from(hotButton.playerScores.entries())
    .map(([playerId, points]) => {
      const player = room.players.get(playerId);
      return {
        playerId,
        playerName: player?.name || 'Unknown',
        avatarSeed: player?.avatarSeed || '',
        totalPoints: points,
        rank: 0,
      };
    })
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));

  // Add players who didn't score any points
  getConnectedPlayers(room).forEach(player => {
    if (!hotButton.playerScores.has(player.id)) {
      playerScoreBreakdown.push({
        playerId: player.id,
        playerName: player.name,
        avatarSeed: player.avatarSeed,
        totalPoints: 0,
        rank: playerScoreBreakdown.length + 1,
      });
    }
  });

  console.log(`🏁 Hot Button round ended`);
  console.log(`📊 Scores:`, playerScoreBreakdown.map(p => `${p.playerName}: ${p.totalPoints}`).join(', '));

  io.to(room.code).emit('hot_button_end', {
    totalQuestions: hotButton.questions.length,
    playerScoreBreakdown,
  });

  room.state.phase = 'bonus_round_result';
  room.state.timerEnd = null;
  broadcastRoomUpdate(room, io);

  // Auto-advance
  const isLastRound = room.state.currentRound >= room.settings.maxRounds;
  const roomCode = room.code;
  
  setTimeout(() => {
    const { getRoom } = require('../roomStore');
    const currentRoom = getRoom(roomCode);
    if (!currentRoom || currentRoom.state.phase !== 'bonus_round_result') return;
    
    if (isLastRound) {
      const { showFinalResults } = require('./matchFlow');
      showFinalResults(currentRoom, io);
    } else {
      const { showScoreboard } = require('./matchFlow');
      showScoreboard(currentRoom, io);
    }
  }, 8000);
}

