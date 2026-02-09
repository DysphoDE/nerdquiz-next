/**
 * Room Store - In-Memory Storage for Game Rooms
 * 
 * Verwaltet alle aktiven Spielräume und bietet Hilfsfunktionen
 * für Room-Management und Client-Serialisierung.
 */

import type { Server as SocketServer } from 'socket.io';
import type {
  GameRoom,
  GameState,
  Player,
  GameSettings,
} from './types';
import type { RoomState } from '@/types/game';
import { createInitialGameState, DEFAULT_GAME_SETTINGS } from './types';
import { botManager } from './botManager';
import {
  ROOM_LIMITS,
  DICE_ROYALE,
  GAME_TIMERS,
} from '@/config/constants';

// ============================================
// ROOM STORAGE
// ============================================

const rooms = new Map<string, GameRoom>();

// ============================================
// ID GENERATORS
// ============================================

/**
 * Generiert einen Room Code
 * Verwendet nur eindeutige Zeichen (kein O/0, I/1, etc.)
 */
export function generateRoomCode(): string {
  const chars = ROOM_LIMITS.CODE_CHARS;
  let code = '';
  for (let i = 0; i < ROOM_LIMITS.CODE_LENGTH; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  // Rekursiv neu generieren bei Kollision
  if (rooms.has(code)) return generateRoomCode();
  return code;
}

/**
 * Generiert eine eindeutige Player ID
 */
export function generatePlayerId(): string {
  return 'p_' + Math.random().toString(36).substring(2, 11);
}

// ============================================
// ROOM CRUD OPERATIONS
// ============================================

/**
 * Holt einen Room aus dem Store
 */
export function getRoom(code: string): GameRoom | undefined {
  return rooms.get(code);
}

/**
 * Speichert einen Room im Store
 */
export function setRoom(code: string, room: GameRoom): void {
  rooms.set(code, room);
}

/**
 * Löscht einen Room aus dem Store
 */
export function deleteRoom(code: string): boolean {
  return rooms.delete(code);
}

/**
 * Prüft ob ein Room existiert
 */
export function hasRoom(code: string): boolean {
  return rooms.has(code);
}

/**
 * Gibt alle Room Codes zurück (für Debug/Admin)
 */
export function getAllRoomCodes(): string[] {
  return Array.from(rooms.keys());
}

/**
 * Iteriert über alle Rooms
 */
export function forEachRoom(callback: (room: GameRoom, code: string) => void): void {
  rooms.forEach(callback);
}

// ============================================
// ROOM CREATION
// ============================================

/**
 * Erstellt einen neuen Raum mit einem Host-Spieler
 */
export function createRoom(hostName: string, settings?: Partial<GameSettings>): { room: GameRoom; player: Player } {
  const roomCode = generateRoomCode();
  const playerId = generatePlayerId();

  const player: Player = {
    id: playerId,
    socketId: '', // Will be set by caller
    name: hostName.trim(),
    avatarSeed: hostName + Date.now(),
    score: 0,
    isHost: true,
    isConnected: true,
    currentAnswer: null,
    estimationAnswer: null,
    answerTime: null,
    streak: 0,
  };

  const room: GameRoom = {
    code: roomCode,
    hostId: playerId,
    players: new Map([[playerId, player]]),
    settings: { ...DEFAULT_GAME_SETTINGS, ...settings },
    state: createInitialGameState(),
    createdAt: new Date(),
  };

  rooms.set(roomCode, room);

  return { room, player };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Würfelt einen Würfel
 */
export function rollDie(): number {
  return Math.floor(Math.random() * DICE_ROYALE.DICE_SIDES) + 1;
}

/**
 * Findet den Spieler mit der niedrigsten Punktzahl
 */
export function getLoserPlayer(room: GameRoom): Player | null {
  const players = Array.from(room.players.values())
    .filter(p => p.isConnected)
    .sort((a, b) => a.score - b.score);
  return players[0] || null;
}

/**
 * Gibt alle verbundenen Spieler zurück
 */
export function getConnectedPlayers(room: GameRoom): Player[] {
  return Array.from(room.players.values()).filter(p => p.isConnected);
}

/**
 * Gibt alle verbundenen menschlichen Spieler zurück (keine Bots)
 */
export function getConnectedHumanPlayers(room: GameRoom): Player[] {
  return Array.from(room.players.values()).filter(p =>
    p.isConnected && !p.socketId.startsWith('bot-')
  );
}

/**
 * Setzt alle Spieler-Antworten zurück
 */
export function resetPlayerAnswers(room: GameRoom): void {
  room.players.forEach(p => {
    p.currentAnswer = null;
    p.estimationAnswer = null;
    p.answerTime = null;
  });
}

/**
 * Setzt alle Spieler-Scores und Streaks zurück
 */
export function resetPlayerScores(room: GameRoom): void {
  room.players.forEach(p => {
    p.score = 0;
    p.streak = 0;
    p.currentAnswer = null;
    p.estimationAnswer = null;
    p.answerTime = null;
  });
}

// ============================================
// ROOM TO CLIENT SERIALIZATION
// ============================================

/**
 * Konvertiert ein GameRoom-Objekt in ein Client-sicheres Format
 * Maps werden zu Objects konvertiert, sensitive Daten werden entfernt
 */
export function roomToClient(room: GameRoom): RoomState {
  const players = Array.from(room.players.values()).map(p => ({
    id: p.id,
    name: p.name,
    avatarSeed: p.avatarSeed,
    score: p.score,
    isHost: p.isHost,
    isConnected: p.isConnected,
    hasAnswered: p.currentAnswer !== null || p.estimationAnswer !== null,
    streak: p.streak,
  }));

  // Sort players by score (highest first)
  players.sort((a, b) => b.score - a.score);

  const question = room.state.currentQuestion;
  const clientQuestion = question ? {
    id: question.id,
    text: question.text,
    type: question.type,
    answers: question.answers,
    unit: question.unit,
    category: question.category,
    categoryIcon: question.categoryIcon,
    // Difficulty is always sent (for dev-mode editing)
    difficulty: question.difficulty,
    // Only send correct answer and explanation during reveal
    ...(room.state.showingCorrectAnswer && {
      correctIndex: question.correctIndex,
      correctValue: question.correctValue,
      explanation: question.explanation,
    }),
  } : null;

  // Convert DiceRoyale state for client (Map -> Record)
  const diceRoyaleClient = room.state.diceRoyale ? {
    playerRolls: Object.fromEntries(room.state.diceRoyale.playerRolls),
    winnerId: room.state.diceRoyale.winnerId,
    tiedPlayerIds: room.state.diceRoyale.tiedPlayerIds,
    phase: room.state.diceRoyale.phase,
    round: room.state.diceRoyale.round,
  } : null;

  // Convert BonusRound state for client
  let bonusRoundClient = null;

  if (room.state.bonusRound) {
    const br = room.state.bonusRound;

    if (br.type === 'collective_list') {
      bonusRoundClient = {
        type: 'collective_list' as const,
        phase: br.phase,
        skipRulesIntro: br.skipRulesIntro,
        questionId: br.questionId,
        topic: br.topic,
        description: br.description,
        category: br.category,
        categoryIcon: br.categoryIcon,
        questionType: br.questionType,
        totalItems: br.items.length,
        items: br.items.map(item => {
          const isGuessed = !!item.guessedBy;
          const isFinished = br.phase === 'finished';
          return {
            id: item.id,
            // Only reveal display text for guessed items or when round is finished
            display: (isGuessed || isFinished) ? item.display : undefined,
            group: (isGuessed || isFinished) ? item.group : undefined,
            guessedBy: item.guessedBy,
            guessedByName: item.guessedByName,
            guessedAt: item.guessedAt,
            // Only send aliases for already guessed items
            aliases: isGuessed ? item.aliases : undefined,
          };
        }),
        revealedCount: br.guessedIds.size,
        currentTurn: br.activePlayers.length > 0 && br.phase === 'playing' ? (() => {
          const currentPlayerId = br.activePlayers[br.currentTurnIndex % br.activePlayers.length];
          const player = room.players.get(currentPlayerId);
          return player ? {
            playerId: currentPlayerId,
            playerName: player.name,
            avatarSeed: player.avatarSeed,
            turnNumber: br.turnNumber,
            timerEnd: room.state.timerEnd || 0,
          } : null;
        })() : null,
        turnOrder: br.turnOrder,
        activePlayers: br.activePlayers,
        eliminatedPlayers: br.eliminatedPlayers,
        lastGuess: br.lastGuess,
        pointsPerCorrect: br.pointsPerCorrect,
        timePerTurn: br.timePerTurn,
        fuzzyThreshold: br.fuzzyThreshold,
      };
    } else if (br.type === 'hot_button') {
      const currentQuestion = br.questions[br.currentQuestionIndex];
      const questionTextLength = currentQuestion?.text.length || 1;
      bonusRoundClient = {
        type: 'hot_button' as const,
        phase: br.phase,
        questionId: br.questionId,
        topic: br.topic,
        description: br.description,
        category: br.category,
        categoryIcon: br.categoryIcon,

        currentQuestionIndex: br.currentQuestionIndex,
        totalQuestions: br.questions.length,
        currentQuestionText: currentQuestion ? currentQuestion.text.substring(0, br.revealedChars) : '',
        currentQuestionId: currentQuestion?.id, // DB ID for dev-mode editing
        currentQuestionDifficulty: currentQuestion?.difficulty, // Difficulty for dev-mode display
        isFullyRevealed: br.isFullyRevealed,
        revealedPercent: Math.round((br.revealedChars / questionTextLength) * 100),

        buzzedPlayerId: br.buzzedPlayerId,
        buzzedPlayerName: br.buzzedPlayerId ? room.players.get(br.buzzedPlayerId)?.name : undefined,
        buzzedPlayerAvatarSeed: br.buzzedPlayerId ? room.players.get(br.buzzedPlayerId)?.avatarSeed : undefined,
        buzzerTimerEnd: br.phase === 'question_reveal' ? room.state.timerEnd : null,
        // Calculate buzzTimeMs from stored timestamp
        buzzTimeMs: br.buzzedPlayerId && br.buzzTimestamps.get(br.buzzedPlayerId)
          ? br.buzzTimestamps.get(br.buzzedPlayerId)! - br.questionStartTime
          : undefined,

        answerTimerEnd: br.phase === 'answering' ? room.state.timerEnd : null,
        lastAnswer: br.lastAnswer ? {
          ...br.lastAnswer,
          // IMPORTANT: Only reveal correct answer when question is truly over
          // (correct answer given OR no more rebuzz attempts)
          correctAnswer: (br.lastAnswer.correct || (br.maxRebuzzAttempts - br.attemptedPlayerIds.size) <= 0)
            ? currentQuestion?.correctAnswer
            : undefined,
        } : undefined,

        attemptedPlayerIds: Array.from(br.attemptedPlayerIds),
        remainingAttempts: br.maxRebuzzAttempts - br.attemptedPlayerIds.size,

        playerScores: Object.fromEntries(br.playerScores),

        // Question history for displaying past questions
        questionHistory: br.questionHistory || [],
      };
    }

  }

  return {
    code: room.code,
    players,
    settings: room.settings,
    phase: room.state.phase,
    currentRound: room.state.currentRound,
    currentQuestionIndex: room.state.currentQuestionIndex,
    totalQuestions: room.settings.questionsPerRound,
    currentQuestion: clientQuestion,
    categorySelectionMode: room.state.categorySelectionMode,
    selectedBonusType: room.state.selectedBonusType, // Für Bonusrunden-Roulette
    votingCategories: room.state.votingCategories,
    categoryVotes: Object.fromEntries(room.state.categoryVotes),
    selectedCategory: room.state.selectedCategory,
    loserPickPlayerId: room.state.loserPickPlayerId,
    diceRoyale: diceRoyaleClient,
    rpsDuel: room.state.rpsDuel,
    bonusRound: bonusRoundClient,
    timerEnd: room.state.timerEnd,
    showingCorrectAnswer: room.state.showingCorrectAnswer,
    wheelSelectedIndex: room.state.wheelSelectedIndex,
    snippetIndex: room.state.snippetIndex,
    ttsUrl: room.state.ttsUrl ?? null,
    rematchVotes: Object.fromEntries(room.state.rematchVotes),
  };
}

// ============================================
// PHASE CHANGE HELPER
// ============================================

const dev = process.env.NODE_ENV !== 'production';

/**
 * Emit phase change and notify bots
 */
export function emitPhaseChange(room: GameRoom, io: SocketServer, phase: string): void {
  io.to(room.code).emit('phase_change', { phase });

  // Notify bots about phase change (dev only)
  if (dev) {
    botManager.onPhaseChange(room.code, phase);
  }
}

/**
 * Emit room update to all clients in the room
 * Includes serverTime for timer synchronization
 */
export function broadcastRoomUpdate(room: GameRoom, io: SocketServer): void {
  const roomData = roomToClient(room);
  // Always include current server time for timer synchronization
  roomData.serverTime = Date.now();
  io.to(room.code).emit('room_update', roomData);
}

// ============================================
// ROOM CLEANUP
// ============================================

/**
 * Löscht einen Raum und räumt Bot-Manager auf
 * WICHTIG: Löscht auch alle aktiven Timer um Memory Leaks zu vermeiden
 */
export function cleanupRoom(code: string): void {
  const room = rooms.get(code);
  
  if (room) {
    // Clear main question timer
    if (room.questionTimer) {
      clearTimeout(room.questionTimer);
      room.questionTimer = undefined;
    }
    
    // Clear cleanup timer
    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
      room.cleanupTimer = undefined;
    }
    
    // Clear bonus round timers
    if (room.state.bonusRound) {
      const br = room.state.bonusRound;
      if (br.type === 'collective_list' && br.currentTurnTimer) {
        clearTimeout(br.currentTurnTimer);
        br.currentTurnTimer = null;
      } else if (br.type === 'hot_button') {
        if (br.revealTimer) clearInterval(br.revealTimer);
        if (br.buzzerTimeout) clearTimeout(br.buzzerTimeout);
        if (br.answerTimer) clearTimeout(br.answerTimer);
      }
    }
  }
  
  // Clean up bots
  if (dev) {
    botManager.cleanupRoom(code);
  }
  
  rooms.delete(code);
  console.log(`🗑️ Room ${code} deleted (all timers cleared)`);
}

/**
 * Prüft ob alle menschlichen Spieler disconnected sind und plant ggf. Löschung
 * Bots werden nicht gezählt - nur echte Spieler halten den Raum am Leben
 * 
 * WICHTIG: Cleanup-Timer ist cancellable - wenn Spieler reconnecten, wird der Timer gelöscht
 */
export function scheduleRoomCleanupIfEmpty(room: GameRoom, io: SocketServer, delayMs: number = GAME_TIMERS.EMPTY_ROOM_CLEANUP): void {
  // Clear any existing cleanup timer
  if (room.cleanupTimer) {
    clearTimeout(room.cleanupTimer);
    room.cleanupTimer = undefined;
    console.log(`⏱️ Cancelled existing cleanup timer for room ${room.code}`);
  }

  const roomCode = room.code;
  room.cleanupTimer = setTimeout(() => {
    const currentRoom = rooms.get(roomCode);
    if (currentRoom) {
      // Only count human players - bots don't keep a room alive
      const connectedHumans = getConnectedHumanPlayers(currentRoom);
      if (connectedHumans.length === 0) {
        console.log(`🗑️ No human players connected in room ${roomCode}, cleaning up...`);
        cleanupRoom(roomCode);
      } else {
        console.log(`✅ Room ${roomCode} still has ${connectedHumans.length} human player(s), keeping alive`);
        currentRoom.cleanupTimer = undefined;
      }
    }
  }, delayMs);
  
  console.log(`⏱️ Scheduled cleanup for room ${roomCode} in ${delayMs / 1000}s`);
}

/**
 * Cancelt einen geplanten Cleanup-Timer (z.B. wenn Spieler reconnecten)
 */
export function cancelRoomCleanup(room: GameRoom): void {
  if (room.cleanupTimer) {
    clearTimeout(room.cleanupTimer);
    room.cleanupTimer = undefined;
    console.log(`✅ Cancelled cleanup timer for room ${room.code} (player reconnected)`);
  }
}

// ============================================
// GAME STATE HELPERS
// ============================================

/**
 * Erstellt den initialen GameState für einen neuen Raum oder Rematch
 */
export { createInitialGameState } from './types';

