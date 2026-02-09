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
  HotButtonQuestionResult,
} from '../types';
import {
  getConnectedPlayers,
  emitPhaseChange,
  broadcastRoomUpdate,
} from '../roomStore';
import { generateAndCache } from '../ttsService';
import { botManager } from '../botManager';
import { checkAnswer as fuzzyCheckAnswer } from '@/lib/fuzzyMatch';
import {
  HOT_BUTTON_TIMING,
  HOT_BUTTON_LIMITS,
  HOT_BUTTON_SCORING,
  MATCHING,
  calculateHotButtonSpeedBonus,
} from '@/config/constants';

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
    questionStartTime: 0, // Will be set when question starts

    buzzedPlayerId: null,
    buzzerTimeout: null,
    buzzerTimeoutDuration: config.buzzerTimeout || (HOT_BUTTON_TIMING.BUZZER_TIMEOUT / 1000), // Default: 25 seconds
    originalBuzzerTimerEnd: null,
    buzzOrder: [],
    buzzTimestamps: new Map(),

    answerTimer: null,
    answerTimeoutDuration: config.answerTimeout || (HOT_BUTTON_TIMING.ANSWER_TIMEOUT / 1000), // Default: 15 seconds

    attemptedPlayerIds: new Set(),
    maxRebuzzAttempts: config.maxRebuzzAttempts || HOT_BUTTON_LIMITS.MAX_REBUZZ_ATTEMPTS,
    allowRebuzz: config.allowRebuzz ?? true,

    playerScores: new Map(),

    // Question History for tracking all answered questions
    questionHistory: [],

    fuzzyThreshold: config.fuzzyThreshold || MATCHING.FUZZY_THRESHOLD,
  };

  room.state.phase = 'bonus_round';
  emitPhaseChange(room, io, 'bonus_round');
  broadcastRoomUpdate(room, io);

  console.log(`⚡ Hot Button Round started: ${topic}`);
  console.log(`   ${questions.length} questions, ${config.buzzerTimeout || (HOT_BUTTON_TIMING.BUZZER_TIMEOUT / 1000)}s buzzer timeout`);

  // After intro, start first question (longer delay so players can read rules)
  setTimeout(() => {
    const { getRoom } = require('../roomStore');
    const currentRoom = getRoom(roomCode);
    if (currentRoom?.state.bonusRound && currentRoom.state.bonusRound.type === 'hot_button' && currentRoom.state.bonusRound.phase === 'intro') {
      startNextQuestion(currentRoom, io);
    }
  }, HOT_BUTTON_TIMING.INTRO);
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Löscht alle aktiven Timer der Hot Button Runde
 */
function clearAllTimers(hotButton: ServerHotButtonState): void {
  if (hotButton.revealTimer) {
    clearInterval(hotButton.revealTimer);
    hotButton.revealTimer = null;
  }
  if (hotButton.buzzerTimeout) {
    clearTimeout(hotButton.buzzerTimeout);
    hotButton.buzzerTimeout = null;
  }
  if (hotButton.answerTimer) {
    clearTimeout(hotButton.answerTimer);
    hotButton.answerTimer = null;
  }
}

// ============================================
// QUESTION MANAGEMENT
// ============================================

/**
 * Startet die nächste Frage
 */
async function startNextQuestion(room: GameRoom, io: SocketServer): Promise<void> {
  const hotButton = room.state.bonusRound;
  if (!hotButton || hotButton.type !== 'hot_button') return;

  const currentQuestion = hotButton.questions[hotButton.currentQuestionIndex];
  if (!currentQuestion) {
    endHotButtonRound(room, io);
    return;
  }

  // CRITICAL: Clear ALL existing timers first!
  clearAllTimers(hotButton);

  // Reset state for new question
  hotButton.phase = 'question_reveal';
  hotButton.revealedChars = 0;
  hotButton.isFullyRevealed = false;
  hotButton.buzzedPlayerId = null;
  hotButton.originalBuzzerTimerEnd = null; // Reset timer for new question
  hotButton.buzzOrder = [];
  hotButton.buzzTimestamps.clear();
  hotButton.attemptedPlayerIds = new Set();
  hotButton.lastAnswer = undefined;

  console.log(`❓ Hot Button Question ${hotButton.currentQuestionIndex + 1}/${hotButton.questions.length}`);
  console.log(`   "${currentQuestion.text}"`);

  // Pre-generate TTS for this question (1 API call for all clients)
  const ttsUrl = await generateAndCache(currentQuestion.text, currentQuestion.id);
  room.state.ttsUrl = ttsUrl;

  broadcastRoomUpdate(room, io);
  startQuestionReveal(room, io, currentQuestion);

  // Notify bots
  if (dev) {
    botManager.onHotButtonQuestionStart(room.code);
  }
}

/**
 * Startet die schrittweise Enthüllung der Frage
 * @param preserveStartTime - Wenn true, wird questionStartTime nicht überschrieben (für Rebuzz)
 */
function startQuestionReveal(room: GameRoom, io: SocketServer, question: any, preserveStartTime: boolean = false): void {
  const hotButton = room.state.bonusRound;
  if (!hotButton || hotButton.type !== 'hot_button') return;

  // CRITICAL: Ensure phase is correct
  if (hotButton.phase !== 'question_reveal') {
    console.warn(`⚠️ startQuestionReveal called in wrong phase: ${hotButton.phase}`);
    return;
  }

  // CRITICAL: Clear existing timers before creating new ones
  if (hotButton.revealTimer) {
    clearInterval(hotButton.revealTimer);
    hotButton.revealTimer = null;
  }
  if (hotButton.buzzerTimeout) {
    clearTimeout(hotButton.buzzerTimeout);
    hotButton.buzzerTimeout = null;
  }

  const revealSpeed = question.revealSpeed || HOT_BUTTON_TIMING.REVEAL_SPEED;
  const roomCode = room.code;
  const questionIndex = hotButton.currentQuestionIndex; // Store for validation

  // Store question start time for buzz speed calculation (only if not rebuzz)
  if (!preserveStartTime) {
    hotButton.questionStartTime = Date.now();
    // Store original timer end for potential rebuzz (to keep remaining time)
    hotButton.originalBuzzerTimerEnd = Date.now() + (hotButton.buzzerTimeoutDuration * 1000);
  }

  // Start buzzer timeout - use remaining time if rebuzz, otherwise full time
  const buzzerEndTime = preserveStartTime && hotButton.originalBuzzerTimerEnd 
    ? hotButton.originalBuzzerTimerEnd 
    : Date.now() + (hotButton.buzzerTimeoutDuration * 1000);
  
  room.state.timerEnd = buzzerEndTime;

  hotButton.revealTimer = setInterval(() => {
    const { getRoom } = require('../roomStore');
    const currentRoom = getRoom(roomCode);
    const hb = currentRoom?.state.bonusRound;

    // CRITICAL: Validate state before continuing
    if (!hb || hb.type !== 'hot_button' || hb.phase !== 'question_reveal' || hb.currentQuestionIndex !== questionIndex) {
      if (hb && hb.type === 'hot_button' && hb.revealTimer) {
        clearInterval(hb.revealTimer);
        hb.revealTimer = null;
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

  // Calculate timeout duration - use remaining time if rebuzz
  const timeoutDuration = preserveStartTime && hotButton.originalBuzzerTimerEnd
    ? Math.max(0, hotButton.originalBuzzerTimerEnd - Date.now())
    : hotButton.buzzerTimeoutDuration * 1000;

  hotButton.buzzerTimeout = setTimeout(() => {
    const { getRoom } = require('../roomStore');
    const currentRoom = getRoom(roomCode);
    const hb = currentRoom?.state.bonusRound;
    
    // CRITICAL: Validate that we're still on the same question
    if (hb && hb.type === 'hot_button' && hb.phase === 'question_reveal' && hb.currentQuestionIndex === questionIndex) {
      handleBuzzerTimeout(currentRoom, io);
    } else {
      console.log(`⏰ Buzzer timeout cancelled - question changed or wrong phase (phase: ${hb?.phase}, question: ${hb?.currentQuestionIndex} vs ${questionIndex})`);
    }
  }, timeoutDuration);
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

  // Calculate buzz speed
  const buzzTimeMs = buzzTime - hotButton.questionStartTime;
  const currentQuestion = hotButton.questions[hotButton.currentQuestionIndex];
  const revealedPercent = Math.round((hotButton.revealedChars / currentQuestion.text.length) * 100);

  // Set answer timer
  room.state.timerEnd = Date.now() + (hotButton.answerTimeoutDuration * 1000);

  const roomCode = room.code;
  const questionIndex = hotButton.currentQuestionIndex;
  
  hotButton.answerTimer = setTimeout(() => {
    const { getRoom } = require('../roomStore');
    const currentRoom = getRoom(roomCode);
    const hb = currentRoom?.state.bonusRound;
    
    // CRITICAL: Validate question index and phase
    if (hb && hb.type === 'hot_button' && hb.phase === 'answering' && hb.currentQuestionIndex === questionIndex) {
      handleAnswerTimeout(currentRoom, io, playerId);
    } else {
      console.log(`⏰ Answer timeout cancelled - question changed or wrong phase`);
    }
  }, hotButton.answerTimeoutDuration * 1000);

  io.to(room.code).emit('hot_button_buzz', {
    playerId,
    playerName: player.name,
    avatarSeed: player.avatarSeed,
    buzzTimeMs,
    revealedPercent,
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

    // Calculate speed bonus using constants
    const buzzTime = hotButton.buzzTimestamps.get(playerId) || Date.now();
    const buzzTimeMs = buzzTime - hotButton.questionStartTime;
    const questionText = currentQuestion.text;
    const revealedPercent = hotButton.revealedChars / questionText.length;

    // Calculate speed bonus based on revealed percentage
    const speedBonus = calculateHotButtonSpeedBonus(revealedPercent);

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

    // Add to question history
    const historyEntry: HotButtonQuestionResult = {
      questionIndex: hotButton.currentQuestionIndex,
      questionText: currentQuestion.text,
      correctAnswer: currentQuestion.correctAnswer,
      result: 'correct',
      answeredBy: {
        playerId,
        playerName: player.name,
        avatarSeed: player.avatarSeed,
        input: answer,
        points: totalPoints,
        speedBonus,
        revealedPercent: Math.round(revealedPercent * 100),
        buzzTimeMs,
      },
    };
    hotButton.questionHistory.push(historyEntry);

    console.log(`✅ ${player.name} CORRECT! +${totalPoints} (${basePoints} base + ${speedBonus} speed bonus)`);

    io.to(room.code).emit('hot_button_answer_result', {
      playerId,
      playerName: player.name,
      avatarSeed: player.avatarSeed,
      answer,
      correct: true,
      correctAnswer: currentQuestion.correctAnswer, // Always send the official answer
      points: totalPoints,
      basePoints,
      speedBonus,
      revealedPercent: Math.round(revealedPercent * 100),
      buzzTimeMs,
      newScore: player.score,
      confidence: result.confidence,
    });

    broadcastRoomUpdate(room, io);

    // Move to next question after delay
    const roomCode = room.code;
    const questionIndex = hotButton.currentQuestionIndex;
    
    setTimeout(() => {
      const { getRoom } = require('../roomStore');
      const currentRoom = getRoom(roomCode);
      const hb = currentRoom?.state.bonusRound;
      
      // CRITICAL: Validate we're still on this question
      if (hb && hb.type === 'hot_button' && hb.currentQuestionIndex === questionIndex) {
        clearAllTimers(hb); // Clear any remaining timers
        hb.currentQuestionIndex++;
        startNextQuestion(currentRoom, io);
      }
    }, HOT_BUTTON_TIMING.RESULT_DISPLAY);


  } else {
    // WRONG!
    const buzzTime = hotButton.buzzTimestamps.get(playerId) || Date.now();
    const buzzTimeMs = buzzTime - hotButton.questionStartTime;
    const points = currentQuestion.pointsWrong || HOT_BUTTON_SCORING.WRONG_PENALTY;
    player.score += points; // Add negative points

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

    // CRITICAL: Check if OTHER players can still attempt (excluding current player)
    const connectedPlayers = getConnectedPlayers(room);
    const playersWhoHaventAttempted = connectedPlayers.filter(p => !hotButton.attemptedPlayerIds.has(p.id));
    const remainingAttempts = hotButton.maxRebuzzAttempts - hotButton.attemptedPlayerIds.size;
    const canRebuzz = hotButton.allowRebuzz && remainingAttempts > 0 && playersWhoHaventAttempted.length > 0;

    console.log(`   Remaining attempts: ${remainingAttempts}, Players who haven't attempted: ${playersWhoHaventAttempted.length}`);

    // Only send correctAnswer if no more attempts remain!
    io.to(room.code).emit('hot_button_answer_result', {
      playerId,
      playerName: player.name,
      avatarSeed: player.avatarSeed,
      answer,
      correct: false,
      points,
      // IMPORTANT: Only reveal correct answer when game is truly over for this question
      correctAnswer: canRebuzz ? undefined : currentQuestion.correctAnswer,
      canRebuzz,
      remainingAttempts,
      buzzTimeMs,
      newScore: player.score,
      confidence: result.confidence,
    });

    broadcastRoomUpdate(room, io);

    if (canRebuzz) {
      // Allow rebuzz
      const remainingTime = hotButton.originalBuzzerTimerEnd 
        ? Math.max(0, Math.round((hotButton.originalBuzzerTimerEnd - Date.now()) / 1000))
        : 0;
      console.log(`   Rebuzz allowed for other players (${remainingTime}s remaining)`);

      const roomCode = room.code;
      const questionIndex = hotButton.currentQuestionIndex; // Store for validation
      
      setTimeout(() => {
        const { getRoom } = require('../roomStore');
        const currentRoom = getRoom(roomCode);
        const hb = currentRoom?.state.bonusRound;
        
        // CRITICAL: Validate we're still on the same question
        if (!hb || hb.type !== 'hot_button' || hb.currentQuestionIndex !== questionIndex) {
          console.log(`   ⚠️ Rebuzz cancelled - question changed`);
          return;
        }

        // CRITICAL: Clear all existing timers before rebuzz
        clearAllTimers(hb);

        hb.phase = 'question_reveal';
        hb.buzzedPlayerId = null;

        // Continue reveal if not fully revealed
        const q = hb.questions[hb.currentQuestionIndex];
        if (!hb.isFullyRevealed && hb.revealedChars < q.text.length) {
          // CRITICAL: Preserve questionStartTime for accurate speed bonus calculation
          startQuestionReveal(currentRoom, io, q, true);
        } else {
          // Already fully revealed, just restart buzzer with remaining time
          startBuzzerPhase(currentRoom, io, questionIndex, true);
        }

        // Notify bots
        if (dev) {
          botManager.onHotButtonRebuzz(roomCode);
        }
      }, HOT_BUTTON_TIMING.REBUZZ_DELAY);
    } else {
      // No more attempts - add to history as wrong (last person who tried)
      const historyEntry: HotButtonQuestionResult = {
        questionIndex: hotButton.currentQuestionIndex,
        questionText: currentQuestion.text,
        correctAnswer: currentQuestion.correctAnswer,
        result: 'wrong',
        answeredBy: {
          playerId,
          playerName: player.name,
          avatarSeed: player.avatarSeed,
          input: answer,
          points,
          speedBonus: 0,
          revealedPercent: Math.round((hotButton.revealedChars / currentQuestion.text.length) * 100),
          buzzTimeMs,
        },
      };
      hotButton.questionHistory.push(historyEntry);

      console.log(`   No more attempts possible, moving to next question`);

      const roomCode = room.code;
      const questionIndex = hotButton.currentQuestionIndex;
      
      setTimeout(() => {
        const { getRoom } = require('../roomStore');
        const currentRoom = getRoom(roomCode);
        const hb = currentRoom?.state.bonusRound;
        
        // CRITICAL: Validate we're still on this question
        if (hb && hb.type === 'hot_button' && hb.currentQuestionIndex === questionIndex) {
          clearAllTimers(hb); // Clear any remaining timers
          hb.currentQuestionIndex++;
          startNextQuestion(currentRoom, io);
        }
      }, HOT_BUTTON_TIMING.RESULT_DISPLAY);
    }


  }
}

/**
 * Startet die Buzzer-Phase (ohne Reveal)
 * @param questionIndex - Question index for validation
 * @param useRemainingTime - If true, use remaining time from originalBuzzerTimerEnd (for rebuzz)
 */
function startBuzzerPhase(room: GameRoom, io: SocketServer, questionIndex: number, useRemainingTime: boolean = false): void {
  const hotButton = room.state.bonusRound;
  if (!hotButton || hotButton.type !== 'hot_button') return;

  // CRITICAL: Clear existing buzzer timeout
  if (hotButton.buzzerTimeout) {
    clearTimeout(hotButton.buzzerTimeout);
    hotButton.buzzerTimeout = null;
  }

  const roomCode = room.code;
  
  // Use remaining time if rebuzz, otherwise full time
  const buzzerEndTime = useRemainingTime && hotButton.originalBuzzerTimerEnd
    ? hotButton.originalBuzzerTimerEnd
    : Date.now() + (hotButton.buzzerTimeoutDuration * 1000);
  
  room.state.timerEnd = buzzerEndTime;

  // Calculate timeout duration
  const timeoutDuration = useRemainingTime && hotButton.originalBuzzerTimerEnd
    ? Math.max(0, hotButton.originalBuzzerTimerEnd - Date.now())
    : hotButton.buzzerTimeoutDuration * 1000;

  hotButton.buzzerTimeout = setTimeout(() => {
    const { getRoom } = require('../roomStore');
    const currentRoom = getRoom(roomCode);
    const hb = currentRoom?.state.bonusRound;
    
    // CRITICAL: Validate question index
    if (hb && hb.type === 'hot_button' && hb.phase === 'question_reveal' && hb.currentQuestionIndex === questionIndex) {
      handleBuzzerTimeout(currentRoom, io);
    } else {
      console.log(`⏰ Buzzer timeout cancelled - question changed or wrong phase`);
    }
  }, timeoutDuration);

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

  // Add to question history - no one buzzed
  const historyEntry: HotButtonQuestionResult = {
    questionIndex: hotButton.currentQuestionIndex,
    questionText: currentQuestion.text,
    correctAnswer: currentQuestion.correctAnswer,
    result: 'no_buzz',
  };
  hotButton.questionHistory.push(historyEntry);

  io.to(room.code).emit('hot_button_timeout', {
    reason: 'buzzer',
    correctAnswer: currentQuestion.correctAnswer,
    questionText: currentQuestion.text,
  });

  broadcastRoomUpdate(room, io);

    // Move to next question
  const roomCode = room.code;
  const questionIndex = hotButton.currentQuestionIndex;
  
  setTimeout(() => {
    const { getRoom } = require('../roomStore');
    const currentRoom = getRoom(roomCode);
    const hb = currentRoom?.state.bonusRound;
    
    // CRITICAL: Validate we're still on this question
    if (hb && hb.type === 'hot_button' && hb.currentQuestionIndex === questionIndex) {
      clearAllTimers(hb); // Clear any remaining timers
      hb.currentQuestionIndex++;
      startNextQuestion(currentRoom, io);
    }
  }, HOT_BUTTON_TIMING.RESULT_DISPLAY);
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

  // Check if rebuzz is possible BEFORE sending the result
  const connectedPlayers = getConnectedPlayers(room);
  const playersWhoHaventAttempted = connectedPlayers.filter(p => !hotButton.attemptedPlayerIds.has(p.id));
  const remainingAttempts = hotButton.maxRebuzzAttempts - hotButton.attemptedPlayerIds.size;
  const canRebuzz = hotButton.allowRebuzz && remainingAttempts > 0 && playersWhoHaventAttempted.length > 0;

  io.to(room.code).emit('hot_button_answer_result', {
    playerId,
    playerName: player?.name,
    answer: '',
    correct: false,
    points: 0,
    timeout: true,
    // Only reveal correct answer when no more rebuzz attempts remain
    correctAnswer: canRebuzz ? undefined : currentQuestion.correctAnswer,
    canRebuzz,
    remainingAttempts,
  });

  broadcastRoomUpdate(room, io);

  if (canRebuzz) {
    console.log(`   Rebuzz allowed after timeout`);
    const roomCode = room.code;
    const questionIndex = hotButton.currentQuestionIndex;
    
    setTimeout(() => {
      const { getRoom } = require('../roomStore');
      const currentRoom = getRoom(roomCode);
      const hb = currentRoom?.state.bonusRound;
      
      // CRITICAL: Validate we're still on the same question
      if (!hb || hb.type !== 'hot_button' || hb.currentQuestionIndex !== questionIndex) {
        console.log(`   ⚠️ Rebuzz cancelled - question changed`);
        return;
      }

      clearAllTimers(hb);
      hb.phase = 'question_reveal';
      hb.buzzedPlayerId = null;
      startBuzzerPhase(currentRoom, io, questionIndex, true); // Use remaining time

      if (dev) {
        botManager.onHotButtonRebuzz(roomCode);
      }
    }, HOT_BUTTON_TIMING.TIMEOUT_REBUZZ_DELAY);
  } else {
    console.log(`   No rebuzz possible after timeout, moving to next question`);
    const roomCode = room.code;
    const questionIndex = hotButton.currentQuestionIndex;
    
    setTimeout(() => {
      const { getRoom } = require('../roomStore');
      const currentRoom = getRoom(roomCode);
      const hb = currentRoom?.state.bonusRound;
      
      // CRITICAL: Validate we're still on this question
      if (hb && hb.type === 'hot_button' && hb.currentQuestionIndex === questionIndex) {
        clearAllTimers(hb);
        hb.currentQuestionIndex++;
        startNextQuestion(currentRoom, io);
      }
    }, HOT_BUTTON_TIMING.REBUZZ_DELAY);
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
  }, HOT_BUTTON_TIMING.FINAL_RESULTS);
}

