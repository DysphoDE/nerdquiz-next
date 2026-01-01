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
import { createInitialGameState, DEFAULT_GAME_SETTINGS } from './types';
import { botManager } from './botManager';

// ============================================
// ROOM STORAGE
// ============================================

const rooms = new Map<string, GameRoom>();

// ============================================
// ID GENERATORS
// ============================================

/**
 * Generiert einen 4-stelligen Room Code
 * Verwendet nur eindeutige Zeichen (kein O/0, I/1, etc.)
 */
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
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
 * Würfelt eine Zahl zwischen 1 und 6
 */
export function rollDie(): number {
  return Math.floor(Math.random() * 6) + 1;
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
export function roomToClient(room: GameRoom): Record<string, any> {
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

  // Convert BonusRound state for client (Set -> Array, hide aliases)
  const bonusRoundClient = room.state.bonusRound ? {
    phase: room.state.bonusRound.phase,
    topic: room.state.bonusRound.topic,
    description: room.state.bonusRound.description,
    category: room.state.bonusRound.category,
    categoryIcon: room.state.bonusRound.categoryIcon,
    questionType: room.state.bonusRound.questionType,
    totalItems: room.state.bonusRound.items.length,
    items: room.state.bonusRound.items.map(item => ({
      id: item.id,
      display: item.display,
      group: item.group,
      guessedBy: item.guessedBy,
      guessedByName: item.guessedByName,
      guessedAt: item.guessedAt,
    })),
    revealedCount: room.state.bonusRound.guessedIds.size,
    currentTurn: room.state.bonusRound.activePlayers.length > 0 && room.state.bonusRound.phase === 'playing' ? (() => {
      const bonusRound = room.state.bonusRound!;
      const currentPlayerId = bonusRound.activePlayers[bonusRound.currentTurnIndex % bonusRound.activePlayers.length];
      const player = room.players.get(currentPlayerId);
      return player ? {
        playerId: currentPlayerId,
        playerName: player.name,
        avatarSeed: player.avatarSeed,
        turnNumber: bonusRound.turnNumber,
        timerEnd: room.state.timerEnd || 0,
      } : null;
    })() : null,
    turnOrder: room.state.bonusRound.turnOrder,
    activePlayers: room.state.bonusRound.activePlayers,
    eliminatedPlayers: room.state.bonusRound.eliminatedPlayers,
    lastGuess: room.state.bonusRound.lastGuess,
    pointsPerCorrect: room.state.bonusRound.pointsPerCorrect,
    timePerTurn: room.state.bonusRound.timePerTurn,
    fuzzyThreshold: room.state.bonusRound.fuzzyThreshold,
  } : null;

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
 */
export function broadcastRoomUpdate(room: GameRoom, io: SocketServer): void {
  io.to(room.code).emit('room_update', roomToClient(room));
}

// ============================================
// ROOM CLEANUP
// ============================================

/**
 * Löscht einen Raum und räumt Bot-Manager auf
 */
export function cleanupRoom(code: string): void {
  if (dev) {
    botManager.cleanupRoom(code);
  }
  rooms.delete(code);
  console.log(`🗑️ Room ${code} deleted`);
}

/**
 * Prüft ob alle Spieler disconnected sind und plant ggf. Löschung
 */
export function scheduleRoomCleanupIfEmpty(room: GameRoom, io: SocketServer, delayMs: number = 60000): void {
  setTimeout(() => {
    const currentRoom = rooms.get(room.code);
    if (currentRoom) {
      const connected = getConnectedPlayers(currentRoom);
      if (connected.length === 0) {
        cleanupRoom(room.code);
      }
    }
  }, delayMs);
}

// ============================================
// GAME STATE HELPERS
// ============================================

/**
 * Erstellt den initialen GameState für einen neuen Raum oder Rematch
 */
export { createInitialGameState } from './types';

