/**
 * NerdQuiz Custom Server
 * Next.js + Socket.io WebSocket Server
 */

import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import next from 'next';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';
import { botManager } from './src/server/botManager';
import * as questionLoader from './src/server/questionLoader';
import { checkAnswer as fuzzyCheckAnswer, normalizeString } from './src/lib/fuzzyMatch';
import { 
  selectRandomCategoryMode, 
  CATEGORY_MODE_DATA_MAP,
  type CategorySelectionModeData,
  type CategorySelectionMode,
} from './src/config/gameModes.shared';

const dev = process.env.NODE_ENV !== 'production';
const hostname = dev ? 'localhost' : '0.0.0.0';
const port = parseInt(process.env.PORT || '3001', 10);

const app = next({ dev, hostname, port, turbopack: false });
const handle = app.getRequestHandler();

// ============================================
// TYPES
// ============================================

interface QuestionData {
  question: string;
  answers?: string[];
  correct?: number;
  correctAnswer?: number;
  unit?: string;
}

interface CategoryData {
  name: string;
  icon: string;
  questions: QuestionData[];
  estimationQuestions?: QuestionData[]; // Some categories have these in a separate array
}

interface CategoryInfo {
  id: string;
  name: string;
  icon: string;
  questionCount: number;
}

interface Player {
  id: string;
  socketId: string;
  name: string;
  avatarSeed: string;
  score: number;
  isHost: boolean;
  isConnected: boolean;
  currentAnswer: number | null;
  estimationAnswer: number | null;
  answerTime: number | null;
  streak: number;
}

interface GameQuestion {
  id: string;
  text: string;
  type: 'choice' | 'estimation';
  answers?: string[];
  correctIndex?: number;
  correctValue?: number;
  unit?: string;
  category: string;
  categoryIcon: string;
  explanation?: string;
}

// CategorySelectionMode is imported from ./src/config/gameModes.shared

// Dice Royale - All players roll, highest wins
interface DiceRoyaleState {
  playerRolls: Map<string, number[] | null>; // playerId -> [die1, die2]
  winnerId: string | null;
  tiedPlayerIds: string[] | null; // Players who need to re-roll
  phase: 'rolling' | 'reroll' | 'result';
  round: number; // Track tie-breaker rounds
}

// Rock Paper Scissors Duel - 2 players, best of 3
type RPSChoice = 'rock' | 'paper' | 'scissors';

interface RPSDuelState {
  player1Id: string;
  player2Id: string;
  player1Choices: RPSChoice[];
  player2Choices: RPSChoice[];
  player1Wins: number;
  player2Wins: number;
  currentRound: number; // 1, 2, or 3
  winnerId: string | null;
  phase: 'selecting' | 'choosing' | 'revealing' | 'result';
}

// Bonus Round - Collective List
interface BonusRoundItem {
  id: string;
  display: string;
  aliases: string[];
  group?: string;
  guessedBy?: string;
  guessedByName?: string;
  guessedAt?: number;
}

interface ServerBonusRoundState {
  phase: 'intro' | 'playing' | 'finished';
  topic: string;
  description?: string;
  category?: string;
  categoryIcon?: string;
  questionType?: string;
  items: BonusRoundItem[];
  guessedIds: Set<string>;
  currentTurnIndex: number;
  currentTurnTimer: NodeJS.Timeout | null;
  turnOrder: string[];
  activePlayers: string[];
  eliminatedPlayers: Array<{
    playerId: string;
    playerName: string;
    avatarSeed: string;
    eliminationReason: 'wrong' | 'timeout' | 'skip';
    rank: number;
  }>;
  lastGuess?: {
    playerId: string;
    playerName: string;
    input: string;
    result: 'correct' | 'wrong' | 'already_guessed' | 'timeout' | 'skip';
    matchedDisplay?: string;
    confidence?: number;
  };
  pointsPerCorrect: number;
  timePerTurn: number;
  fuzzyThreshold: number;
  turnNumber: number;
  /** Tracks how many correct answers each player got */
  playerCorrectCounts: Map<string, number>;
}

interface GameRoom {
  code: string;
  hostId: string;
  players: Map<string, Player>;
  settings: {
    maxRounds: number;
    questionsPerRound: number;
    timePerQuestion: number;
    // Bonusrunden-Einstellungen
    bonusRoundChance: number; // 0-100, Wahrscheinlichkeit dass eine Runde zur Bonusrunde wird
    finalRoundAlwaysBonus: boolean; // Letzte Runde immer als Bonusrunde
    // Zukünftige Erweiterungen
    enableEstimation: boolean; // Schätzfragen aktiviert
    enableMediaQuestions: boolean; // Bild/Audio/Video Fragen
  };
  state: {
    phase: 'lobby' | 'round_announcement' | 'category_announcement' | 'category_voting' | 'category_wheel' | 'category_losers_pick' | 'category_dice_royale' | 'category_rps_duel' | 'question' | 'estimation' | 'revealing' | 'estimation_reveal' | 'scoreboard' | 'bonus_round_announcement' | 'bonus_round' | 'bonus_round_result' | 'final' | 'rematch_voting';
    currentRound: number;
    currentQuestionIndex: number;
    currentQuestion: GameQuestion | null;
    categorySelectionMode: CategorySelectionMode | null;
    votingCategories: CategoryInfo[];
    categoryVotes: Map<string, string>;
    selectedCategory: string | null;
    roundQuestions: GameQuestion[];
    timerEnd: number | null;
    showingCorrectAnswer: boolean;
    loserPickPlayerId: string | null;
    lastLoserPickRound: number; // Cooldown tracking
    diceRoyale: DiceRoyaleState | null;
    rpsDuel: RPSDuelState | null;
    bonusRound: ServerBonusRoundState | null;
    wheelSelectedIndex: number | null; // Pre-selected wheel index for animation
    // Duplikat-Vermeidung: bereits verwendete Fragen-IDs
    usedQuestionIds: Set<string>;
    usedBonusQuestionIds: Set<string>;
    // Rematch Voting
    rematchVotes: Map<string, 'yes' | 'no'>;
  };
  createdAt: Date;
}

// ============================================
// CATEGORY LOADER (uses questionLoader with DB/JSON fallback)
// ============================================

// Wrapper functions that use the questionLoader module
async function getRandomCategoriesForVoting(count: number = 8): Promise<CategoryInfo[]> {
  return questionLoader.getRandomCategoriesForVoting(count);
}

async function getRandomQuestions(categoryId: string, count: number, excludeIds: string[] = []): Promise<GameQuestion[]> {
  return questionLoader.getRandomQuestions(categoryId, count, excludeIds);
}

// Helper: Get questions for a room with duplicate prevention
async function getQuestionsForRoom(room: GameRoom, categoryId: string, count: number): Promise<GameQuestion[]> {
  const excludeIds = Array.from(room.state.usedQuestionIds);
  const questions = await getRandomQuestions(categoryId, count, excludeIds);
  
  // Track used questions
  for (const q of questions) {
    room.state.usedQuestionIds.add(q.id);
  }
  
  return questions;
}

async function getCategoryData(categoryId: string): Promise<{ name: string; icon: string } | null> {
  return questionLoader.getCategoryData(categoryId);
}

// ============================================
// IN-MEMORY STORE
// ============================================

const rooms = new Map<string, GameRoom>();

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  if (rooms.has(code)) return generateRoomCode();
  return code;
}

function generatePlayerId(): string {
  return 'p_' + Math.random().toString(36).substring(2, 11);
}

function rollDie(): number {
  return Math.floor(Math.random() * 6) + 1;
}

/**
 * Emit phase change and notify bots
 */
function emitPhaseChange(room: GameRoom, io: SocketServer, phase: string) {
  io.to(room.code).emit('phase_change', { phase });
  
  // Notify bots about phase change (dev only)
  if (dev) {
    botManager.onPhaseChange(room.code, phase);
  }
}

function roomToClient(room: GameRoom) {
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
      const currentPlayerId = room.state.bonusRound!.activePlayers[room.state.bonusRound!.currentTurnIndex % room.state.bonusRound!.activePlayers.length];
      const player = room.players.get(currentPlayerId);
      return player ? {
        playerId: currentPlayerId,
        playerName: player.name,
        avatarSeed: player.avatarSeed,
        turnNumber: room.state.bonusRound!.turnNumber,
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
// START SERVER
// ============================================

app.prepare().then(async () => {
  const expressApp = express();
  const httpServer = createServer(expressApp);
  
  // Check database connection and load categories
  const dbConnected = await questionLoader.isDatabaseConnected();
  const categories = await questionLoader.getCategoryList();
  console.log(`\n📚 ${categories.length} Kategorien geladen ${dbConnected ? '(Supabase)' : '(JSON Fallback)'}\n`);

  const io = new SocketServer(httpServer, {
    cors: {
      origin: dev 
        ? ['http://localhost:3000', 'http://localhost:3001'] 
        : process.env.CORS_ORIGIN?.split(',') || [],
      methods: ['GET', 'POST'],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // ============================================
  // BOT MANAGER SETUP (Development only)
  // ============================================

  if (dev) {
    botManager.initialize(io, (code) => rooms.get(code));
    
    // Register action handlers for bots
    botManager.registerActionHandler('vote_category', (data) => {
      const room = rooms.get(data.roomCode);
      if (!room || room.state.phase !== 'category_voting') return;
      room.state.categoryVotes.set(data.playerId, data.categoryId);
      io.to(data.roomCode).emit('room_update', roomToClient(room));
      if (room.state.categoryVotes.size >= room.players.size) {
        finalizeCategoryVoting(room, io);
      }
    });

    botManager.registerActionHandler('submit_answer', (data) => {
      const room = rooms.get(data.roomCode);
      if (!room || room.state.phase !== 'question') return;
      const player = room.players.get(data.playerId);
      if (!player || player.currentAnswer !== null) return;
      player.currentAnswer = data.answerIndex;
      player.answerTime = room.state.timerEnd ? room.state.timerEnd - Date.now() : 0;
      io.to(data.roomCode).emit('room_update', roomToClient(room));
      io.to(data.roomCode).emit('player_answered', { playerId: data.playerId, playerName: player.name });
      const allAnswered = Array.from(room.players.values()).every(
        p => p.currentAnswer !== null || !p.isConnected
      );
      if (allAnswered) {
        clearTimeout((room as any).questionTimer);
        showAnswer(room, io);
      }
    });

    botManager.registerActionHandler('submit_estimation', (data) => {
      const room = rooms.get(data.roomCode);
      if (!room || room.state.phase !== 'estimation') return;
      const player = room.players.get(data.playerId);
      if (!player || player.estimationAnswer !== null) return;
      player.estimationAnswer = data.value;
      player.answerTime = room.state.timerEnd ? room.state.timerEnd - Date.now() : 0;
      io.to(data.roomCode).emit('room_update', roomToClient(room));
      io.to(data.roomCode).emit('player_answered', { playerId: data.playerId, playerName: player.name });
      const allEstimated = Array.from(room.players.values()).every(
        p => p.estimationAnswer !== null || !p.isConnected
      );
      if (allEstimated) {
        clearTimeout((room as any).questionTimer);
        showEstimationAnswer(room, io);
      }
    });

    botManager.registerActionHandler('loser_pick_category', (data) => {
      const room = rooms.get(data.roomCode);
      if (!room || room.state.phase !== 'category_losers_pick') return;
      if (data.playerId !== room.state.loserPickPlayerId) return;
      finalizeLosersPick(room, io, data.categoryId);
    });

    // Dice Royale bot handler
    botManager.registerActionHandler('dice_royale_roll', (data) => {
      const room = rooms.get(data.roomCode);
      if (!room || room.state.phase !== 'category_dice_royale') return;
      const royale = room.state.diceRoyale;
      if (!royale || royale.phase !== 'rolling') return;
      if (!royale.playerRolls.has(data.playerId)) return;
      if (royale.playerRolls.get(data.playerId) !== null) return;
      // Check if in tie-breaker and player is eligible
      if (royale.tiedPlayerIds && !royale.tiedPlayerIds.includes(data.playerId)) return;
      const rolls = [rollDie(), rollDie()];
      royale.playerRolls.set(data.playerId, rolls);
      io.to(room.code).emit('dice_royale_roll', { playerId: data.playerId, rolls });
      io.to(room.code).emit('room_update', roomToClient(room));
      // Check if all eligible players have rolled
      let allRolled = true;
      const eligiblePlayers = royale.tiedPlayerIds || Array.from(royale.playerRolls.keys());
      eligiblePlayers.forEach(pid => {
        if (royale.playerRolls.get(pid) === null) allRolled = false;
      });
      if (allRolled) {
        setTimeout(() => checkDiceRoyaleResult(room, io), 1500);
      }
    });

    botManager.registerActionHandler('dice_royale_pick', (data) => {
      const room = rooms.get(data.roomCode);
      if (!room || room.state.phase !== 'category_dice_royale') return;
      const royale = room.state.diceRoyale;
      if (!royale || royale.phase !== 'result') return;
      if (data.playerId !== royale.winnerId) return;
      finalizeDiceRoyalePick(room, io, data.categoryId);
    });

    // RPS Duel bot handlers
    botManager.registerActionHandler('rps_choice', (data) => {
      const room = rooms.get(data.roomCode);
      if (!room || room.state.phase !== 'category_rps_duel') return;
      const duel = room.state.rpsDuel;
      if (!duel || duel.phase !== 'choosing') return;
      const isPlayer1 = data.playerId === duel.player1Id;
      const isPlayer2 = data.playerId === duel.player2Id;
      if (!isPlayer1 && !isPlayer2) return;
      const currentIndex = duel.currentRound - 1;
      if (isPlayer1 && duel.player1Choices[currentIndex]) return;
      if (isPlayer2 && duel.player2Choices[currentIndex]) return;
      if (isPlayer1) duel.player1Choices.push(data.choice);
      else duel.player2Choices.push(data.choice);
      io.to(room.code).emit('rps_choice_made', { playerId: data.playerId });
      if (duel.player1Choices.length === duel.currentRound && duel.player2Choices.length === duel.currentRound) {
        resolveRPSRound(room, io);
      }
    });

    botManager.registerActionHandler('rps_duel_pick', (data) => {
      const room = rooms.get(data.roomCode);
      if (!room || room.state.phase !== 'category_rps_duel') return;
      const duel = room.state.rpsDuel;
      if (!duel || duel.phase !== 'result') return;
      if (data.playerId !== duel.winnerId) return;
      finalizeRPSDuelPick(room, io, data.categoryId);
    });

    // Bonus Round bot handlers
    botManager.registerActionHandler('bonus_round_submit', (data) => {
      const room = rooms.get(data.roomCode);
      if (!room || room.state.phase !== 'bonus_round') return;
      const bonusRound = room.state.bonusRound;
      if (!bonusRound || bonusRound.phase !== 'playing') return;
      const currentPlayerId = bonusRound.activePlayers[bonusRound.currentTurnIndex % bonusRound.activePlayers.length];
      if (data.playerId !== currentPlayerId) return;
      handleBonusRoundAnswer(room, io, data.playerId, data.answer);
    });

    botManager.registerActionHandler('bonus_round_skip', (data) => {
      const room = rooms.get(data.roomCode);
      if (!room || room.state.phase !== 'bonus_round') return;
      const bonusRound = room.state.bonusRound;
      if (!bonusRound || bonusRound.phase !== 'playing') return;
      const currentPlayerId = bonusRound.activePlayers[bonusRound.currentTurnIndex % bonusRound.activePlayers.length];
      if (data.playerId !== currentPlayerId) return;
      handleBonusRoundSkip(room, io, data.playerId);
    });
  }

  // ============================================
  // SOCKET EVENTS
  // ============================================

  io.on('connection', (socket) => {
    console.log(`🔌 Connected: ${socket.id}`);

    // === CREATE ROOM ===
    socket.on('create_room', (data: { playerName: string }, callback) => {
      const roomCode = generateRoomCode();
      const playerId = generatePlayerId();
      
      const player: Player = {
        id: playerId,
        socketId: socket.id,
        name: data.playerName.trim(),
        avatarSeed: data.playerName + Date.now(),
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
        settings: {
          maxRounds: 5,
          questionsPerRound: 5,
          timePerQuestion: 20,
          // Bonusrunden-Einstellungen
          bonusRoundChance: 0, // Default: keine zufälligen Bonusrunden
          finalRoundAlwaysBonus: false, // Default: letzte Runde normal
          // Zukünftige Erweiterungen
          enableEstimation: true, // Default: Schätzfragen aktiv
          enableMediaQuestions: false, // Default: noch deaktiviert
        },
        state: {
          phase: 'lobby',
          currentRound: 1,
          currentQuestionIndex: 0,
          currentQuestion: null,
          categorySelectionMode: null,
          votingCategories: [],
          categoryVotes: new Map(),
          selectedCategory: null,
          roundQuestions: [],
          timerEnd: null,
          showingCorrectAnswer: false,
          loserPickPlayerId: null,
          lastLoserPickRound: 0,
          diceRoyale: null,
          rpsDuel: null,
          bonusRound: null,
          wheelSelectedIndex: null,
          usedQuestionIds: new Set(),
          usedBonusQuestionIds: new Set(),
          rematchVotes: new Map(),
        },
        createdAt: new Date(),
      };

      rooms.set(roomCode, room);
      socket.join(roomCode);
      
      console.log(`🎮 Room ${roomCode} created by ${data.playerName}`);
      
      callback({
        success: true,
        roomCode,
        playerId,
        room: roomToClient(room),
      });
    });

    // === JOIN ROOM ===
    socket.on('join_room', (data: { roomCode: string; playerName: string }, callback) => {
      const code = data.roomCode.toUpperCase();
      const room = rooms.get(code);
      
      if (!room) {
        callback({ success: false, error: 'Raum nicht gefunden' });
        return;
      }

      if (room.state.phase !== 'lobby') {
        callback({ success: false, error: 'Spiel läuft bereits' });
        return;
      }

      if (room.players.size >= 12) {
        callback({ success: false, error: 'Raum ist voll (max. 12)' });
        return;
      }

      const nameTaken = Array.from(room.players.values()).some(
        p => p.name.toLowerCase() === data.playerName.trim().toLowerCase()
      );
      if (nameTaken) {
        callback({ success: false, error: 'Name bereits vergeben' });
        return;
      }

      const playerId = generatePlayerId();
      const player: Player = {
        id: playerId,
        socketId: socket.id,
        name: data.playerName.trim(),
        avatarSeed: data.playerName + Date.now(),
        score: 0,
        isHost: false,
        isConnected: true,
        currentAnswer: null,
        estimationAnswer: null,
        answerTime: null,
        streak: 0,
      };

      room.players.set(playerId, player);
      socket.join(code);

      console.log(`👤 ${data.playerName} joined ${code}`);

      io.to(code).emit('room_update', roomToClient(room));
      io.to(code).emit('player_joined', { playerName: data.playerName, playerId });

      callback({
        success: true,
        roomCode: code,
        playerId,
        room: roomToClient(room),
      });
    });

    // === UPDATE SETTINGS ===
    socket.on('update_settings', (data: { roomCode: string; playerId: string; settings: any }) => {
      const room = rooms.get(data.roomCode);
      if (!room) return;
      
      const player = room.players.get(data.playerId);
      if (!player?.isHost) return;
      
      room.settings = { ...room.settings, ...data.settings };
      io.to(data.roomCode).emit('room_update', roomToClient(room));
    });

    // === REROLL AVATAR ===
    socket.on('reroll_avatar', (data: { roomCode: string; playerId: string }) => {
      const room = rooms.get(data.roomCode);
      if (!room) return;
      
      // Only allow in lobby
      if (room.state.phase !== 'lobby') return;
      
      const player = room.players.get(data.playerId);
      if (!player) return;
      
      // Generate new avatar seed
      player.avatarSeed = player.name + Date.now() + Math.random().toString(36).slice(2);
      
      console.log(`🎲 ${player.name} rerolled avatar`);
      
      io.to(data.roomCode).emit('room_update', roomToClient(room));
    });

    // === START GAME ===
    socket.on('start_game', (data: { roomCode: string; playerId: string }, callback) => {
      const room = rooms.get(data.roomCode);
      
      if (!room) {
        callback({ success: false, error: 'Raum nicht gefunden' });
        return;
      }

      const player = room.players.get(data.playerId);
      if (!player?.isHost) {
        callback({ success: false, error: 'Nur der Host kann starten' });
        return;
      }

      startCategorySelection(room, io);
      console.log(`🚀 Game started in ${data.roomCode}`);
      callback({ success: true });
    });

    // === VOTE CATEGORY ===
    socket.on('vote_category', (data: { roomCode: string; playerId: string; categoryId: string }) => {
      const room = rooms.get(data.roomCode);
      if (!room || room.state.phase !== 'category_voting') return;

      room.state.categoryVotes.set(data.playerId, data.categoryId);
      io.to(data.roomCode).emit('room_update', roomToClient(room));

      if (room.state.categoryVotes.size >= room.players.size) {
        finalizeCategoryVoting(room, io);
      }
    });

    // === LOSER PICK CATEGORY ===
    socket.on('loser_pick_category', (data: { roomCode: string; playerId: string; categoryId: string }) => {
      const room = rooms.get(data.roomCode);
      if (!room || room.state.phase !== 'category_losers_pick') return;

      // Only the designated loser can pick
      if (data.playerId !== room.state.loserPickPlayerId) return;

      finalizeLosersPick(room, io, data.categoryId);
    });

    // === DICE ROYALE ROLL ===
    socket.on('dice_royale_roll', (data: { roomCode: string; playerId: string }) => {
      const room = rooms.get(data.roomCode);
      if (!room || room.state.phase !== 'category_dice_royale') return;
      
      const royale = room.state.diceRoyale;
      if (!royale || royale.phase !== 'rolling') return;

      // Check if player is eligible to roll
      if (!royale.playerRolls.has(data.playerId)) return;
      
      // Check if already rolled
      if (royale.playerRolls.get(data.playerId) !== null) return;

      // Check if in tie-breaker and player is eligible
      if (royale.tiedPlayerIds && !royale.tiedPlayerIds.includes(data.playerId)) return;

      // Roll the dice!
      const rolls = [rollDie(), rollDie()];
      royale.playerRolls.set(data.playerId, rolls);

      const player = room.players.get(data.playerId);
      console.log(`🎲 ${player?.name} rolled: ${rolls[0]} + ${rolls[1]} = ${rolls[0] + rolls[1]}`);

      io.to(room.code).emit('dice_royale_roll', {
        playerId: data.playerId,
        rolls: rolls,
      });
      io.to(room.code).emit('room_update', roomToClient(room));

      // Check if all eligible players have rolled
      let allRolled = true;
      const eligiblePlayers = royale.tiedPlayerIds || Array.from(royale.playerRolls.keys());
      eligiblePlayers.forEach(pid => {
        if (royale.playerRolls.get(pid) === null) allRolled = false;
      });

      if (allRolled) {
        setTimeout(() => {
          checkDiceRoyaleResult(room, io);
        }, 1500); // Wait for animation
      }
    });

    // === DICE ROYALE PICK CATEGORY ===
    socket.on('dice_royale_pick', (data: { roomCode: string; playerId: string; categoryId: string }) => {
      const room = rooms.get(data.roomCode);
      if (!room || room.state.phase !== 'category_dice_royale') return;
      
      const royale = room.state.diceRoyale;
      if (!royale || royale.phase !== 'result') return;

      // Only the winner can pick
      if (data.playerId !== royale.winnerId) return;

      finalizeDiceRoyalePick(room, io, data.categoryId);
    });

    // === RPS DUEL CHOICE ===
    socket.on('rps_choice', (data: { roomCode: string; playerId: string; choice: RPSChoice }) => {
      const room = rooms.get(data.roomCode);
      if (!room || room.state.phase !== 'category_rps_duel') return;
      
      const duel = room.state.rpsDuel;
      if (!duel || duel.phase !== 'choosing') return;

      // Check if this player is in the duel
      const isPlayer1 = data.playerId === duel.player1Id;
      const isPlayer2 = data.playerId === duel.player2Id;
      if (!isPlayer1 && !isPlayer2) return;

      // Check if already chose this round
      const currentIndex = duel.currentRound - 1;
      if (isPlayer1 && duel.player1Choices[currentIndex]) return;
      if (isPlayer2 && duel.player2Choices[currentIndex]) return;

      // Register choice
      if (isPlayer1) {
        duel.player1Choices.push(data.choice);
      } else {
        duel.player2Choices.push(data.choice);
      }

      const player = room.players.get(data.playerId);
      console.log(`✊✌️✋ ${player?.name} chose: ${data.choice}`);

      io.to(room.code).emit('rps_choice_made', { playerId: data.playerId });

      // Check if both have chosen
      if (duel.player1Choices.length === duel.currentRound && duel.player2Choices.length === duel.currentRound) {
        resolveRPSRound(room, io);
      }
    });

    // === RPS DUEL PICK CATEGORY ===
    socket.on('rps_duel_pick', (data: { roomCode: string; playerId: string; categoryId: string }) => {
      const room = rooms.get(data.roomCode);
      if (!room || room.state.phase !== 'category_rps_duel') return;
      
      const duel = room.state.rpsDuel;
      if (!duel || duel.phase !== 'result') return;

      // Only the winner can pick
      if (data.playerId !== duel.winnerId) return;

      finalizeRPSDuelPick(room, io, data.categoryId);
    });

    // === SUBMIT ANSWER (Multiple Choice) ===
    socket.on('submit_answer', (data: { roomCode: string; playerId: string; answerIndex: number }) => {
      const room = rooms.get(data.roomCode);
      if (!room || room.state.phase !== 'question') return;

      const player = room.players.get(data.playerId);
      if (!player || player.currentAnswer !== null) return;

      player.currentAnswer = data.answerIndex;
      player.answerTime = room.state.timerEnd ? room.state.timerEnd - Date.now() : 0;

      io.to(data.roomCode).emit('room_update', roomToClient(room));
      io.to(data.roomCode).emit('player_answered', { 
        playerId: data.playerId,
        playerName: player.name 
      });

      const allAnswered = Array.from(room.players.values()).every(
        p => p.currentAnswer !== null || !p.isConnected
      );
      if (allAnswered) {
        clearTimeout((room as any).questionTimer);
        showAnswer(room, io);
      }
    });

    // === SUBMIT ESTIMATION ===
    socket.on('submit_estimation', (data: { roomCode: string; playerId: string; value: number }) => {
      const room = rooms.get(data.roomCode);
      if (!room || room.state.phase !== 'estimation') return;

      const player = room.players.get(data.playerId);
      if (!player || player.estimationAnswer !== null) return;

      player.estimationAnswer = data.value;
      player.answerTime = room.state.timerEnd ? room.state.timerEnd - Date.now() : 0;

      io.to(data.roomCode).emit('room_update', roomToClient(room));
      io.to(data.roomCode).emit('player_answered', { 
        playerId: data.playerId,
        playerName: player.name 
      });

      const allAnswered = Array.from(room.players.values()).every(
        p => p.estimationAnswer !== null || !p.isConnected
      );
      if (allAnswered) {
        clearTimeout((room as any).questionTimer);
        showEstimationAnswer(room, io);
      }
    });

    // === BONUS ROUND SUBMIT ===
    socket.on('bonus_round_submit', (data: { roomCode: string; playerId: string; answer: string }) => {
      const room = rooms.get(data.roomCode);
      if (!room || room.state.phase !== 'bonus_round') return;
      
      const bonusRound = room.state.bonusRound;
      if (!bonusRound || bonusRound.phase !== 'playing') return;
      
      // Check if it's this player's turn
      const currentPlayerId = bonusRound.activePlayers[bonusRound.currentTurnIndex % bonusRound.activePlayers.length];
      if (data.playerId !== currentPlayerId) return;
      
      handleBonusRoundAnswer(room, io, data.playerId, data.answer);
    });

    // === BONUS ROUND SKIP ===
    socket.on('bonus_round_skip', (data: { roomCode: string; playerId: string }) => {
      const room = rooms.get(data.roomCode);
      if (!room || room.state.phase !== 'bonus_round') return;
      
      const bonusRound = room.state.bonusRound;
      if (!bonusRound || bonusRound.phase !== 'playing') return;
      
      // Check if it's this player's turn
      const currentPlayerId = bonusRound.activePlayers[bonusRound.currentTurnIndex % bonusRound.activePlayers.length];
      if (data.playerId !== currentPlayerId) return;
      
      handleBonusRoundSkip(room, io, data.playerId);
    });

    // === REMATCH VOTE ===
    socket.on('vote_rematch', (data: { roomCode: string; playerId: string; vote: 'yes' | 'no' }) => {
      const room = rooms.get(data.roomCode);
      if (!room || room.state.phase !== 'rematch_voting') return;
      
      const player = room.players.get(data.playerId);
      if (!player || !player.isConnected) return;
      
      // Already voted?
      if (room.state.rematchVotes.has(data.playerId)) return;
      
      room.state.rematchVotes.set(data.playerId, data.vote);
      
      console.log(`🗳️ ${player.name} voted ${data.vote} for rematch`);
      
      // Wenn "Nein" gestimmt wurde, Spieler sofort aus dem Raum entfernen
      if (data.vote === 'no') {
        // Benachrichtige den Spieler und entferne ihn
        socket.emit('kicked_from_room', { reason: 'Du hast gegen eine weitere Runde gestimmt.' });
        socket.leave(room.code);
        
        // Markiere als disconnected (wird bei finalizeRematchVoting entfernt)
        player.isConnected = false;
        
        console.log(`👋 ${player.name} left after voting no`);
      }
      
      io.to(room.code).emit('rematch_vote_update', {
        playerId: data.playerId,
        playerName: player.name,
        vote: data.vote,
        totalVotes: room.state.rematchVotes.size,
        totalPlayers: Array.from(room.players.values()).filter(p => p.isConnected).length,
      });
      io.to(room.code).emit('room_update', roomToClient(room));
      
      // Check if all connected players have voted
      const connectedPlayers = Array.from(room.players.values()).filter(p => p.isConnected);
      if (room.state.rematchVotes.size >= connectedPlayers.length) {
        finalizeRematchVoting(room, io);
      }
    });

    // === NEXT (Host only) ===
    socket.on('next', (data: { roomCode: string; playerId: string }) => {
      const room = rooms.get(data.roomCode);
      if (!room) return;
      
      const player = room.players.get(data.playerId);
      if (!player?.isHost) return;

      if (room.state.phase === 'revealing' || room.state.phase === 'estimation_reveal') {
        proceedAfterReveal(room, io);
      } else if (room.state.phase === 'scoreboard') {
        // startCategorySelection prüft selbst ob eine Bonusrunde kommt
        // und ruft ggf. showFinalResults auf, wenn die letzte Runde bereits gespielt wurde
        startCategorySelection(room, io);
      }
    });

    // === DEV COMMANDS (Development only) ===
    socket.on('dev_command', async (data: { roomCode: string; playerId: string; command: string; params?: any }) => {
      // Only allow in development
      if (process.env.NODE_ENV === 'production') return;

      const room = rooms.get(data.roomCode);
      if (!room) return;

      const player = room.players.get(data.playerId);
      if (!player?.isHost) return; // Only host can use dev commands

      console.log(`🔧 Dev command: ${data.command}`, data.params);

      switch (data.command) {
        case 'force_category_mode': {
          // Store forced mode for next category selection
          (room as any).forcedCategoryMode = data.params?.mode;
          io.to(room.code).emit('dev_notification', { 
            message: `Nächster Modus: ${data.params?.mode}` 
          });
          break;
        }

        case 'add_bot': {
          const botId = generatePlayerId();
          const botNames = ['🤖 Bot-Alex', '🤖 Bot-Sam', '🤖 Bot-Max', '🤖 Bot-Kim', '🤖 Bot-Jo'];
          const botName = botNames[room.players.size % botNames.length];
          
          const bot: Player = {
            id: botId,
            socketId: 'bot-' + botId,
            name: botName,
            avatarSeed: 'bot-' + Math.random().toString(36).slice(2),
            score: 0,
            isHost: false,
            isConnected: true,
            currentAnswer: null,
            estimationAnswer: null,
            answerTime: null,
            streak: 0,
          };
          
          room.players.set(botId, bot);
          
          // Register bot with BotManager
          botManager.registerBot(botId, data.roomCode, botName);
          
          io.to(room.code).emit('room_update', roomToClient(room));
          io.to(room.code).emit('dev_notification', { message: `${botName} hinzugefügt` });
          break;
        }

        case 'randomize_scores': {
          room.players.forEach(p => {
            p.score = Math.floor(Math.random() * 5000);
            p.streak = Math.floor(Math.random() * 5);
          });
          io.to(room.code).emit('room_update', roomToClient(room));
          io.to(room.code).emit('dev_notification', { message: 'Scores randomisiert' });
          break;
        }

        case 'skip_to_question': {
          if (room.state.phase === 'lobby') {
            startCategorySelection(room, io);
          }
          // Auto-select category if in voting phase
          setTimeout(async () => {
            if (room.state.votingCategories.length > 0) {
              const randomCat = room.state.votingCategories[0];
              room.state.selectedCategory = randomCat.id;
              room.state.roundQuestions = await getQuestionsForRoom(room, randomCat.id, room.settings.questionsPerRound);
              room.state.currentQuestionIndex = 0;
              startQuestion(room, io);
            }
          }, 500);
          break;
        }

        case 'skip_to_estimation': {
          // Find an estimation question from the database
          // For dev mode, just get any category and load an estimation question
          const categories = await questionLoader.getCategoryList();
          if (categories.length > 0) {
            const questions = await getRandomQuestions(categories[0].id, 5);
            const estQ = questions.find(q => q.type === 'estimation');
            if (estQ) {
              room.state.currentQuestion = estQ;
              room.state.phase = 'estimation';
              room.state.timerEnd = Date.now() + 30000;
              emitPhaseChange(room, io, 'estimation');
              io.to(room.code).emit('room_update', roomToClient(room));
              io.to(room.code).emit('dev_notification', { message: 'Schätzfrage geladen' });
            }
          }
          break;
        }

        case 'skip_to_scoreboard': {
          showScoreboard(room, io);
          io.to(room.code).emit('dev_notification', { message: 'Scoreboard angezeigt' });
          break;
        }

        case 'skip_to_final': {
          showFinalResults(room, io);
          io.to(room.code).emit('dev_notification', { message: 'Finale angezeigt' });
          break;
        }

        case 'start_bonus_round': {
          // Start a bonus round with a random COLLECTIVE_LIST question from DB
          const excludeIds = Array.from(room.state.usedBonusQuestionIds);
          const bonusQuestion = await questionLoader.getRandomBonusRoundQuestion(excludeIds);
          if (bonusQuestion) {
            // Track used question
            room.state.usedBonusQuestionIds.add(bonusQuestion.id);
            
            startBonusRound(room, io, {
              topic: bonusQuestion.topic,
              description: bonusQuestion.description,
              category: bonusQuestion.category,
              categoryIcon: bonusQuestion.categoryIcon,
              questionType: bonusQuestion.questionType,
              items: bonusQuestion.items,
              timePerTurn: bonusQuestion.timePerTurn,
              pointsPerCorrect: bonusQuestion.pointsPerCorrect,
              fuzzyThreshold: bonusQuestion.fuzzyThreshold,
            });
            io.to(room.code).emit('dev_notification', { message: `Bonusrunde gestartet: ${bonusQuestion.topic}` });
          } else {
            io.to(room.code).emit('dev_notification', { message: 'Keine Bonusrunden-Frage in DB gefunden!' });
          }
          break;
        }
      }
    });

    // === RECONNECT ===
    socket.on('reconnect_player', (data: { roomCode: string; playerId: string }, callback) => {
      const room = rooms.get(data.roomCode);
      if (!room) {
        callback({ success: false, error: 'Raum nicht gefunden' });
        return;
      }

      const player = room.players.get(data.playerId);
      if (!player) {
        callback({ success: false, error: 'Spieler nicht gefunden' });
        return;
      }

      player.socketId = socket.id;
      player.isConnected = true;
      socket.join(data.roomCode);

      io.to(data.roomCode).emit('player_reconnected', { playerId: data.playerId });
      io.to(data.roomCode).emit('room_update', roomToClient(room));

      callback({ success: true, room: roomToClient(room) });
    });

    // === DISCONNECT ===
    socket.on('disconnect', () => {
      console.log(`🔌 Disconnected: ${socket.id}`);
      
      rooms.forEach((room, roomCode) => {
        room.players.forEach((player) => {
          if (player.socketId === socket.id) {
            player.isConnected = false;
            
            if (player.isHost) {
              const newHost = Array.from(room.players.values())
                .find(p => p.isConnected && p.id !== player.id);
              
              if (newHost) {
                player.isHost = false;
                newHost.isHost = true;
                room.hostId = newHost.id;
                io.to(roomCode).emit('host_changed', { newHostId: newHost.id });
              }
            }
            
            io.to(roomCode).emit('player_disconnected', { 
              playerId: player.id, 
              playerName: player.name 
            });
            io.to(roomCode).emit('room_update', roomToClient(room));

            setTimeout(() => {
              const currentRoom = rooms.get(roomCode);
              if (currentRoom) {
                const connected = Array.from(currentRoom.players.values()).filter(p => p.isConnected);
                if (connected.length === 0) {
                  // Clean up bots in this room
                  if (dev) {
                    botManager.cleanupRoom(roomCode);
                  }
                  rooms.delete(roomCode);
                  console.log(`🗑️ Room ${roomCode} deleted`);
                }
              }
            }, 60000);
          }
        });
      });
    });
  });

  // ============================================
  // GAME LOGIC
  // ============================================

  // ============================================
  // CATEGORY SELECTION MODES
  // ============================================

  function selectCategoryMode(room: GameRoom): CategorySelectionMode {
    // Check for forced mode (dev command)
    const forcedMode = (room as any).forcedCategoryMode;
    if (forcedMode) {
      delete (room as any).forcedCategoryMode; // Use only once
      console.log(`🔧 Using forced category mode: ${forcedMode}`);
      return forcedMode;
    }

    const connectedPlayers = Array.from(room.players.values()).filter(p => p.isConnected);
    const playerCount = connectedPlayers.length;
    
    // Baue lastModeRounds Map für Cooldown-Prüfung
    // Aktuell tracken wir nur lastLoserPickRound, erweitern wir zu einer Map
    const lastModeRounds = new Map<string, number>();
    if (room.state.lastLoserPickRound > 0) {
      lastModeRounds.set('losers_pick', room.state.lastLoserPickRound);
    }
    
    // Nutze zentrale Config für gewichtete Zufallsauswahl
    const selectedMode = selectRandomCategoryMode(
      playerCount, 
      lastModeRounds, 
      room.state.currentRound
    );
    
    console.log(`🎯 Selected category mode: ${selectedMode.name} (${selectedMode.id}) for ${playerCount} players`);
    
    return selectedMode.id as CategorySelectionMode;
  }

  function getLoserPlayer(room: GameRoom): Player | null {
    const players = Array.from(room.players.values())
      .filter(p => p.isConnected)
      .sort((a, b) => a.score - b.score);
    return players[0] || null;
  }

  async function startCategorySelection(room: GameRoom, io: SocketServer) {
    // === RUNDENERHÖHUNG ===
    // Wenn wir vom Scoreboard kommen (nicht von Lobby), erhöhen wir die Runde
    const comingFromScoreboard = room.state.phase === 'scoreboard';
    
    if (comingFromScoreboard) {
      room.state.currentRound++;
      console.log(`📈 Round incremented to ${room.state.currentRound}/${room.settings.maxRounds}`);
    }
    
    // === PRÜFEN OB SPIEL VORBEI ===
    // Wenn currentRound > maxRounds, dann sind alle Runden gespielt
    if (room.state.currentRound > room.settings.maxRounds) {
      console.log(`🏁 All ${room.settings.maxRounds} rounds completed, showing final results`);
      showFinalResults(room, io);
      return;
    }

    // === BONUSRUNDEN-LOGIK ===
    // Prüfen ob diese Runde eine Bonusrunde werden soll
    const isLastRound = room.state.currentRound === room.settings.maxRounds;
    
    // Bonusrunde wenn:
    // 1. Letzte Runde UND "Finale = Bonusrunde" aktiviert, ODER
    // 2. Zufalls-Check basierend auf bonusRoundChance (gilt für ALLE Runden inkl. letzte)
    const chanceTriggered = room.settings.bonusRoundChance > 0 && Math.random() * 100 < room.settings.bonusRoundChance;
    const shouldBeBonusRound = 
      (isLastRound && room.settings.finalRoundAlwaysBonus) || chanceTriggered;
    
    console.log(`🎮 Round ${room.state.currentRound}/${room.settings.maxRounds} - isLastRound: ${isLastRound}, chanceTriggered: ${chanceTriggered}, shouldBeBonusRound: ${shouldBeBonusRound}`);

    if (shouldBeBonusRound) {
      console.log(`🎯 Round ${room.state.currentRound}: BONUS ROUND triggered!`);
      
      // Versuche eine Bonusrunden-Frage aus der DB zu laden (mit Duplikat-Vermeidung)
      const excludeIds = Array.from(room.state.usedBonusQuestionIds);
      const bonusQuestion = await questionLoader.getRandomBonusRoundQuestion(excludeIds);
      if (bonusQuestion) {
        // Track used question
        room.state.usedBonusQuestionIds.add(bonusQuestion.id);
        
        // Zeige zuerst die Bonusrunden-Ankündigung mit Roulette
        room.state.phase = 'bonus_round_announcement';
        room.state.categorySelectionMode = null;
        
        // Speichere die Bonusfrage für später
        (room as any).pendingBonusQuestion = bonusQuestion;
        
        emitPhaseChange(room, io, 'bonus_round_announcement');
        io.to(room.code).emit('room_update', roomToClient(room));
        
        // Nach dem Roulette + Beschreibung (5.5s) starte die eigentliche Bonusrunde
        setTimeout(() => {
          const pendingQuestion = (room as any).pendingBonusQuestion;
          delete (room as any).pendingBonusQuestion;
          
          if (pendingQuestion) {
            startBonusRound(room, io, {
              topic: pendingQuestion.topic,
              description: pendingQuestion.description,
              category: pendingQuestion.category,
              categoryIcon: pendingQuestion.categoryIcon,
              questionType: pendingQuestion.questionType,
              items: pendingQuestion.items,
              timePerTurn: pendingQuestion.timePerTurn,
              pointsPerCorrect: pendingQuestion.pointsPerCorrect,
              fuzzyThreshold: pendingQuestion.fuzzyThreshold,
            });
          }
        }, 5500); // Match the normal round announcement timing
        
        return; // Beende früh, Bonusrunde läuft jetzt
      } else {
        console.log(`⚠️ No bonus round question found in DB, falling back to normal round`);
        // Fallback: normale Runde wenn keine Bonusfrage vorhanden
      }
    }

    // === NORMALE RUNDE ===
    const mode = selectCategoryMode(room);
    room.state.categorySelectionMode = mode;
    // 8 categories for wheel, but voting/loser's pick will use all of them too
    room.state.votingCategories = await getRandomCategoriesForVoting(8);
    room.state.categoryVotes = new Map();
    room.state.selectedCategory = null;
    room.state.loserPickPlayerId = null;

    console.log(`🎲 Round ${room.state.currentRound}: Category mode = ${mode}`);

    // First show announcement
    room.state.phase = 'category_announcement';
    
    let announcementData: any = { mode };
    
    if (mode === 'losers_pick') {
      const loser = getLoserPlayer(room);
      if (loser) {
        room.state.loserPickPlayerId = loser.id;
        room.state.lastLoserPickRound = room.state.currentRound;
        announcementData.loserPlayerId = loser.id;
        announcementData.loserPlayerName = loser.name;
      } else {
        // Fallback to voting if no loser found
        room.state.categorySelectionMode = 'voting';
        announcementData.mode = 'voting';
      }
    }

    io.to(room.code).emit('category_mode', announcementData);
    io.to(room.code).emit('room_update', roomToClient(room));

    // After announcement + roulette animation + description display, start the actual selection
    // Roulette: ~3s spin, then ~2s for description display
    setTimeout(() => {
      if (room.state.categorySelectionMode === 'voting') {
        startCategoryVoting(room, io);
      } else if (room.state.categorySelectionMode === 'wheel') {
        startCategoryWheel(room, io);
      } else if (room.state.categorySelectionMode === 'losers_pick') {
        startLosersPick(room, io);
      } else if (room.state.categorySelectionMode === 'dice_royale') {
        startDiceRoyale(room, io);
      } else if (room.state.categorySelectionMode === 'rps_duel') {
        startRPSDuel(room, io);
      }
    }, 5500); // 5.5 seconds: ~3s roulette + ~2.5s description
  }

  function startCategoryVoting(room: GameRoom, io: SocketServer) {
    room.state.phase = 'category_voting';
    room.state.timerEnd = Date.now() + 15000;

    emitPhaseChange(room, io, 'category_voting');
    io.to(room.code).emit('room_update', roomToClient(room));

    setTimeout(() => {
      if (room.state.phase === 'category_voting') {
        finalizeCategoryVoting(room, io);
      }
    }, 15000);
  }

  function startCategoryWheel(room: GameRoom, io: SocketServer) {
    room.state.phase = 'category_wheel';
    
    // The wheel shows max 8 categories, so we only pick from those
    const WHEEL_SEGMENTS = 8;
    const wheelCategories = room.state.votingCategories.slice(0, WHEEL_SEGMENTS);
    
    // Pre-select a random category from the wheel categories
    const selectedIndex = Math.floor(Math.random() * wheelCategories.length);
    const selectedCat = wheelCategories[selectedIndex];
    
    // Store the selected index in room state so clients can read it on mount
    room.state.wheelSelectedIndex = selectedIndex;
    
    console.log(`🎡 Wheel will land on index ${selectedIndex}: ${selectedCat.name}`);
    
    emitPhaseChange(room, io, 'category_wheel');
    io.to(room.code).emit('room_update', roomToClient(room));

    // Wheel animation takes ~5 seconds, then show result
    setTimeout(() => {
      if (room.state.phase === 'category_wheel') {
        finalizeWheelSelection(room, io, selectedCat.id);
      }
    }, 5500); // Animation duration
  }

  function startLosersPick(room: GameRoom, io: SocketServer) {
    room.state.phase = 'category_losers_pick';
    room.state.timerEnd = Date.now() + 15000;

    emitPhaseChange(room, io, 'category_losers_pick');
    io.to(room.code).emit('room_update', roomToClient(room));

    // Timeout fallback - random selection if loser doesn't pick
    setTimeout(() => {
      if (room.state.phase === 'category_losers_pick') {
        const randomCat = room.state.votingCategories[
          Math.floor(Math.random() * room.state.votingCategories.length)
        ];
        finalizeLosersPick(room, io, randomCat.id);
      }
    }, 15000);
  }

  // ============================================
  // DICE ROYALE - All players roll, highest wins
  // ============================================

  function startDiceRoyale(room: GameRoom, io: SocketServer) {
    room.state.phase = 'category_dice_royale';
    
    const connectedPlayers = Array.from(room.players.values())
      .filter(p => p.isConnected);
    
    // Initialize all players with null rolls
    const playerRolls = new Map<string, number[] | null>();
    connectedPlayers.forEach(p => playerRolls.set(p.id, null));

    room.state.diceRoyale = {
      playerRolls,
      winnerId: null,
      tiedPlayerIds: null,
      phase: 'rolling',
      round: 1,
    };

    console.log(`🎲 Dice Royale: ${connectedPlayers.length} players competing`);

    emitPhaseChange(room, io, 'category_dice_royale');
    io.to(room.code).emit('room_update', roomToClient(room));

    // Send start event after small delay
    setTimeout(() => {
      io.to(room.code).emit('dice_royale_start', {
        players: connectedPlayers.map(p => ({
          id: p.id,
          name: p.name,
          avatarSeed: p.avatarSeed,
        })),
      });
      io.to(room.code).emit('dice_royale_ready');
    }, 500);

    // Timeout - auto-roll for players who haven't rolled after 15 seconds
    setTimeout(() => {
      if (room.state.phase === 'category_dice_royale' && room.state.diceRoyale?.phase === 'rolling') {
        autoRollRemainingPlayers(room, io);
      }
    }, 15500);
  }

  function autoRollRemainingPlayers(room: GameRoom, io: SocketServer) {
    const royale = room.state.diceRoyale;
    if (!royale) return;

    // Auto-roll for any player who hasn't rolled
    royale.playerRolls.forEach((rolls, playerId) => {
      if (rolls === null) {
        const autoRolls = [rollDie(), rollDie()];
        royale.playerRolls.set(playerId, autoRolls);
        io.to(room.code).emit('dice_royale_roll', {
          playerId,
          rolls: autoRolls,
        });
      }
    });

    // Check result after auto-rolls
    setTimeout(() => checkDiceRoyaleResult(room, io), 500);
  }

  function checkDiceRoyaleResult(room: GameRoom, io: SocketServer) {
    const royale = room.state.diceRoyale;
    if (!royale) return;

    // Check if all players have rolled
    let allRolled = true;
    royale.playerRolls.forEach((rolls) => {
      if (rolls === null) allRolled = false;
    });
    if (!allRolled) return;

    // Calculate sums and find highest
    const sums: { playerId: string; sum: number; rolls: number[] }[] = [];
    royale.playerRolls.forEach((rolls, playerId) => {
      if (rolls) {
        sums.push({ playerId, sum: rolls[0] + rolls[1], rolls });
      }
    });

    sums.sort((a, b) => b.sum - a.sum);
    const highestSum = sums[0]?.sum || 0;
    const tiedPlayers = sums.filter(s => s.sum === highestSum);

    console.log(`🎲 Dice Royale results - highest: ${highestSum}, tied: ${tiedPlayers.length}`);

    if (tiedPlayers.length > 1) {
      // Tie! Only tied players roll again
      royale.tiedPlayerIds = tiedPlayers.map(p => p.playerId);
      royale.phase = 'reroll';
      royale.round++;

      io.to(room.code).emit('dice_royale_tie', {
        tiedPlayerIds: royale.tiedPlayerIds,
        round: royale.round,
      });
      io.to(room.code).emit('room_update', roomToClient(room));

      // Reset rolls only for tied players
      setTimeout(() => {
        if (royale.tiedPlayerIds) {
          royale.tiedPlayerIds.forEach(playerId => {
            royale.playerRolls.set(playerId, null);
          });
          royale.phase = 'rolling';
          io.to(room.code).emit('dice_royale_ready');
          io.to(room.code).emit('room_update', roomToClient(room));

          // Timeout for re-roll
          setTimeout(() => {
            if (room.state.phase === 'category_dice_royale' && royale.phase === 'rolling') {
              autoRollRemainingPlayers(room, io);
            }
          }, 10000);
        }
      }, 2500);
      return;
    }

    // We have a winner!
    const winnerId = tiedPlayers[0].playerId;
    royale.winnerId = winnerId;
    royale.phase = 'result';
    room.state.loserPickPlayerId = winnerId; // Reuse for winner who picks

    const winner = room.players.get(winnerId);
    console.log(`🎲 Dice Royale Winner: ${winner?.name} with ${highestSum}`);

    // Notify bot manager about dice royale winner
    if (dev) {
      botManager.onDiceRoyaleWinner(room.code, winnerId);
    }

    io.to(room.code).emit('dice_royale_winner', {
      winnerId,
      winnerName: winner?.name,
      winningSum: highestSum,
      allResults: sums.map(s => ({
        playerId: s.playerId,
        playerName: room.players.get(s.playerId)?.name,
        rolls: s.rolls,
        sum: s.sum,
      })),
    });
    io.to(room.code).emit('room_update', roomToClient(room));

    // After showing winner, let them pick
    setTimeout(() => {
      if (room.state.phase === 'category_dice_royale') {
        startDiceRoyalePick(room, io);
      }
    }, 3000);
  }

  function startDiceRoyalePick(room: GameRoom, io: SocketServer) {
    room.state.timerEnd = Date.now() + 15000;
    io.to(room.code).emit('dice_royale_pick');
    io.to(room.code).emit('room_update', roomToClient(room));

    // Timeout fallback
    setTimeout(() => {
      if (room.state.phase === 'category_dice_royale' && room.state.diceRoyale?.phase === 'result') {
        const randomCat = room.state.votingCategories[
          Math.floor(Math.random() * room.state.votingCategories.length)
        ];
        finalizeDiceRoyalePick(room, io, randomCat.id);
      }
    }, 15000);
  }

  async function finalizeDiceRoyalePick(room: GameRoom, io: SocketServer, categoryId: string) {
    room.state.selectedCategory = categoryId;
    room.state.roundQuestions = await getQuestionsForRoom(room, categoryId, room.settings.questionsPerRound);
    room.state.currentQuestionIndex = 0;

    const categoryData = await getCategoryData(categoryId);
    const winner = room.state.diceRoyale?.winnerId ? room.players.get(room.state.diceRoyale.winnerId) : null;
    
    io.to(room.code).emit('category_selected', { 
      categoryId,
      categoryName: categoryData?.name,
      categoryIcon: categoryData?.icon,
      pickedBy: winner?.id,
      pickedByName: winner?.name,
    });

    // Clean up dice royale state
    room.state.diceRoyale = null;

    setTimeout(() => {
      startQuestion(room, io);
    }, 2500);
  }

  // ============================================
  // RPS DUEL - Rock Paper Scissors, Best of 3
  // ============================================

  function startRPSDuel(room: GameRoom, io: SocketServer) {
    room.state.phase = 'category_rps_duel';
    
    const connectedPlayers = Array.from(room.players.values())
      .filter(p => p.isConnected);
    
    if (connectedPlayers.length < 2) {
      startCategoryVoting(room, io);
      return;
    }

    // Shuffle and pick 2
    const shuffled = [...connectedPlayers].sort(() => Math.random() - 0.5);
    const player1 = shuffled[0];
    const player2 = shuffled[1];

    room.state.rpsDuel = {
      player1Id: player1.id,
      player2Id: player2.id,
      player1Choices: [],
      player2Choices: [],
      player1Wins: 0,
      player2Wins: 0,
      currentRound: 1,
      winnerId: null,
      phase: 'selecting',
    };

    console.log(`✊✌️✋ RPS Duel: ${player1.name} vs ${player2.name}`);

    emitPhaseChange(room, io, 'category_rps_duel');
    io.to(room.code).emit('room_update', roomToClient(room));

    // Send start event
    setTimeout(() => {
      io.to(room.code).emit('rps_duel_start', {
        player1: { id: player1.id, name: player1.name, avatarSeed: player1.avatarSeed },
        player2: { id: player2.id, name: player2.name, avatarSeed: player2.avatarSeed },
      });
    }, 500);

    // Start first round after intro
    setTimeout(() => {
      if (room.state.rpsDuel) {
        room.state.rpsDuel.phase = 'choosing';
        startRPSRound(room, io);
      }
    }, 3000);
  }

  function startRPSRound(room: GameRoom, io: SocketServer) {
    const duel = room.state.rpsDuel;
    if (!duel) return;

    room.state.timerEnd = Date.now() + 10000;
    io.to(room.code).emit('rps_round_start', { round: duel.currentRound });
    io.to(room.code).emit('room_update', roomToClient(room));

    // Timeout - auto-choose for players who haven't chosen
    setTimeout(() => {
      if (room.state.phase === 'category_rps_duel' && duel.phase === 'choosing') {
        const choices: RPSChoice[] = ['rock', 'paper', 'scissors'];
        const p1CurrentChoice = duel.player1Choices[duel.currentRound - 1];
        const p2CurrentChoice = duel.player2Choices[duel.currentRound - 1];

        if (!p1CurrentChoice) {
          const autoChoice = choices[Math.floor(Math.random() * 3)];
          duel.player1Choices.push(autoChoice);
          io.to(room.code).emit('rps_choice_made', { playerId: duel.player1Id });
        }
        if (!p2CurrentChoice) {
          const autoChoice = choices[Math.floor(Math.random() * 3)];
          duel.player2Choices.push(autoChoice);
          io.to(room.code).emit('rps_choice_made', { playerId: duel.player2Id });
        }
        resolveRPSRound(room, io);
      }
    }, 10000);
  }

  function resolveRPSRound(room: GameRoom, io: SocketServer) {
    const duel = room.state.rpsDuel;
    if (!duel) return;

    const p1Choice = duel.player1Choices[duel.currentRound - 1];
    const p2Choice = duel.player2Choices[duel.currentRound - 1];

    if (!p1Choice || !p2Choice) return;

    duel.phase = 'revealing';

    // Determine round winner
    let roundWinner: 'player1' | 'player2' | 'tie' = 'tie';
    if (p1Choice !== p2Choice) {
      if (
        (p1Choice === 'rock' && p2Choice === 'scissors') ||
        (p1Choice === 'paper' && p2Choice === 'rock') ||
        (p1Choice === 'scissors' && p2Choice === 'paper')
      ) {
        roundWinner = 'player1';
        duel.player1Wins++;
      } else {
        roundWinner = 'player2';
        duel.player2Wins++;
      }
    }

    console.log(`✊✌️✋ Round ${duel.currentRound}: ${p1Choice} vs ${p2Choice} - Winner: ${roundWinner}`);

    io.to(room.code).emit('rps_round_result', {
      round: duel.currentRound,
      player1Choice: p1Choice,
      player2Choice: p2Choice,
      roundWinner,
      player1Wins: duel.player1Wins,
      player2Wins: duel.player2Wins,
    });

    // Check for match winner (first to 2)
    if (duel.player1Wins >= 2 || duel.player2Wins >= 2) {
      // We have a match winner!
      setTimeout(() => {
        const winnerId = duel.player1Wins >= 2 ? duel.player1Id : duel.player2Id;
        duel.winnerId = winnerId;
        duel.phase = 'result';
        room.state.loserPickPlayerId = winnerId;

        const winner = room.players.get(winnerId);
        console.log(`✊✌️✋ RPS Duel Winner: ${winner?.name}`);

        // Notify bot manager about RPS duel winner
        if (dev) {
          botManager.onRPSDuelWinner(room.code, winnerId);
        }

        io.to(room.code).emit('rps_duel_winner', {
          winnerId,
          winnerName: winner?.name,
          player1Wins: duel.player1Wins,
          player2Wins: duel.player2Wins,
        });
        io.to(room.code).emit('room_update', roomToClient(room));

        // Let winner pick
        setTimeout(() => {
          if (room.state.phase === 'category_rps_duel') {
            startRPSDuelPick(room, io);
          }
        }, 3000);
      }, 2500);
    } else if (duel.currentRound >= 3) {
      // After 3 rounds, whoever leads wins (even if they don't have 2 wins)
      setTimeout(() => {
        let winnerId: string;
        if (duel.player1Wins > duel.player2Wins) {
          winnerId = duel.player1Id;
        } else if (duel.player2Wins > duel.player1Wins) {
          winnerId = duel.player2Id;
        } else {
          // True tie after 3 rounds (0:0) - continue with extra round
          duel.currentRound++;
          duel.phase = 'choosing';
          startRPSRound(room, io);
          return;
        }

        duel.winnerId = winnerId;
        duel.phase = 'result';
        room.state.loserPickPlayerId = winnerId;

        const winner = room.players.get(winnerId);
        console.log(`✊✌️✋ RPS Duel Winner (after 3 rounds): ${winner?.name}`);

        // Notify bot manager about RPS duel winner
        if (dev) {
          botManager.onRPSDuelWinner(room.code, winnerId);
        }

        io.to(room.code).emit('rps_duel_winner', {
          winnerId,
          winnerName: winner?.name,
          player1Wins: duel.player1Wins,
          player2Wins: duel.player2Wins,
        });
        io.to(room.code).emit('room_update', roomToClient(room));

        // Let winner pick
        setTimeout(() => {
          if (room.state.phase === 'category_rps_duel') {
            startRPSDuelPick(room, io);
          }
        }, 3000);
      }, 2500);
    } else {
      // Start next round
      setTimeout(() => {
        duel.currentRound++;
        duel.phase = 'choosing';
        startRPSRound(room, io);
      }, 2500);
    }
  }

  function startRPSDuelPick(room: GameRoom, io: SocketServer) {
    room.state.timerEnd = Date.now() + 15000;
    io.to(room.code).emit('rps_duel_pick');
    io.to(room.code).emit('room_update', roomToClient(room));

    // Timeout fallback
    setTimeout(() => {
      if (room.state.phase === 'category_rps_duel' && room.state.rpsDuel?.phase === 'result') {
        const randomCat = room.state.votingCategories[
          Math.floor(Math.random() * room.state.votingCategories.length)
        ];
        finalizeRPSDuelPick(room, io, randomCat.id);
      }
    }, 15000);
  }

  async function finalizeRPSDuelPick(room: GameRoom, io: SocketServer, categoryId: string) {
    room.state.selectedCategory = categoryId;
    room.state.roundQuestions = await getQuestionsForRoom(room, categoryId, room.settings.questionsPerRound);
    room.state.currentQuestionIndex = 0;

    const categoryData = await getCategoryData(categoryId);
    const winner = room.state.rpsDuel?.winnerId ? room.players.get(room.state.rpsDuel.winnerId) : null;
    
    io.to(room.code).emit('category_selected', { 
      categoryId,
      categoryName: categoryData?.name,
      categoryIcon: categoryData?.icon,
      pickedBy: winner?.id,
      pickedByName: winner?.name,
    });

    // Clean up RPS duel state
    room.state.rpsDuel = null;

    setTimeout(() => {
      startQuestion(room, io);
    }, 2500);
  }

  async function finalizeWheelSelection(room: GameRoom, io: SocketServer, categoryId: string) {
    room.state.selectedCategory = categoryId;
    room.state.roundQuestions = await getQuestionsForRoom(room, categoryId, room.settings.questionsPerRound);
    room.state.currentQuestionIndex = 0;
    room.state.wheelSelectedIndex = null; // Clear wheel index

    const categoryData = await getCategoryData(categoryId);
    
    io.to(room.code).emit('category_selected', { 
      categoryId,
      categoryName: categoryData?.name,
      categoryIcon: categoryData?.icon,
    });

    setTimeout(() => {
      startQuestion(room, io);
    }, 2000);
  }

  async function finalizeLosersPick(room: GameRoom, io: SocketServer, categoryId: string) {
    room.state.selectedCategory = categoryId;
    room.state.roundQuestions = await getQuestionsForRoom(room, categoryId, room.settings.questionsPerRound);
    room.state.currentQuestionIndex = 0;

    const categoryData = await getCategoryData(categoryId);
    
    io.to(room.code).emit('category_selected', { 
      categoryId,
      categoryName: categoryData?.name,
      categoryIcon: categoryData?.icon,
      pickedBy: room.state.loserPickPlayerId,
    });

    setTimeout(() => {
      startQuestion(room, io);
    }, 2500);
  }

  async function finalizeCategoryVoting(room: GameRoom, io: SocketServer) {
    const voteCounts = new Map<string, number>();
    room.state.categoryVotes.forEach((catId) => {
      voteCounts.set(catId, (voteCounts.get(catId) || 0) + 1);
    });

    let maxVotes = 0;
    let winners: string[] = [];
    
    if (voteCounts.size > 0) {
      voteCounts.forEach((count, catId) => {
        if (count > maxVotes) {
          maxVotes = count;
          winners = [catId];
        } else if (count === maxVotes) {
          winners.push(catId);
        }
      });
    }

    const selectedCategoryId = winners.length > 0 
      ? winners[Math.floor(Math.random() * winners.length)]
      : room.state.votingCategories[Math.floor(Math.random() * room.state.votingCategories.length)]?.id;

    room.state.selectedCategory = selectedCategoryId;
    room.state.roundQuestions = await getQuestionsForRoom(room, selectedCategoryId, room.settings.questionsPerRound);
    room.state.currentQuestionIndex = 0;

    const categoryData = await getCategoryData(selectedCategoryId);
    
    // If there's a tie, send tiebreaker event first with roulette animation
    const isTie = winners.length > 1;
    const tiedCategories = isTie 
      ? winners.map(catId => {
          const cat = room.state.votingCategories.find(c => c.id === catId);
          return cat ? { id: cat.id, name: cat.name, icon: cat.icon } : null;
        }).filter(Boolean)
      : [];

    if (isTie) {
      console.log(`🎰 Voting tie between ${winners.length} categories, starting roulette...`);
      io.to(room.code).emit('voting_tiebreaker', {
        tiedCategories,
        winnerId: selectedCategoryId,
      });
      
      // Wait for roulette animation, then send category_selected
      setTimeout(() => {
        io.to(room.code).emit('category_selected', { 
          categoryId: selectedCategoryId,
          categoryName: categoryData?.name,
          categoryIcon: categoryData?.icon,
        });

        setTimeout(() => {
          startQuestion(room, io);
        }, 2500);
      }, 3000); // 3 seconds for roulette
    } else {
      io.to(room.code).emit('category_selected', { 
        categoryId: selectedCategoryId,
        categoryName: categoryData?.name,
        categoryIcon: categoryData?.icon,
      });

      setTimeout(() => {
        startQuestion(room, io);
      }, 2500);
    }
  }

  function startQuestion(room: GameRoom, io: SocketServer) {
    const question = room.state.roundQuestions[room.state.currentQuestionIndex];
    if (!question) {
      showScoreboard(room, io);
      return;
    }

    room.players.forEach(p => {
      p.currentAnswer = null;
      p.estimationAnswer = null;
      p.answerTime = null;
    });

    room.state.phase = question.type === 'estimation' ? 'estimation' : 'question';
    room.state.currentQuestion = question;
    room.state.showingCorrectAnswer = false;
    room.state.timerEnd = Date.now() + (room.settings.timePerQuestion * 1000);

    emitPhaseChange(room, io, room.state.phase);
    io.to(room.code).emit('room_update', roomToClient(room));

    (room as any).questionTimer = setTimeout(() => {
      if (room.state.phase === 'question') {
        showAnswer(room, io);
      } else if (room.state.phase === 'estimation') {
        showEstimationAnswer(room, io);
      }
    }, room.settings.timePerQuestion * 1000);
  }

  function showAnswer(room: GameRoom, io: SocketServer) {
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

    const results: any[] = [];
    
    room.players.forEach((player) => {
      const correct = player.currentAnswer === question.correctIndex;
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
        answer: player.currentAnswer,
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
    io.to(room.code).emit('room_update', roomToClient(room));
  }

  function showEstimationAnswer(room: GameRoom, io: SocketServer) {
    room.state.phase = 'estimation_reveal'; // Special phase for animated reveal
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
      .sort((a, b) => a.absDiff - b.absDiff); // Best first

    const results: any[] = [];
    
    // NEW: Accuracy-based scoring system
    // - Accuracy points: Based on how close you are (max 1000 points)
    // - Rank bonus: Small bonus for placement (1st: 300, 2nd: 200, 3rd: 100, rest: 50)
    // - Perfect bonus: Extra 500 for exact answer
    
    const rankBonuses = [300, 200, 100]; // Top 3 get extra bonus
    const baseRankBonus = 50; // Everyone else gets 50
    const maxAccuracyPoints = 1000;
    const perfectBonus = 500;
    
    playerEstimates.forEach((entry, index) => {
      let accuracyPoints = 0;
      let rankBonus = 0;
      let perfect = 0;
      
      if (entry.estimation !== null) {
        // Calculate percentage deviation from correct value
        // Use max(correctValue, 1) to avoid division by zero
        const percentageOff = (entry.absDiff / Math.max(Math.abs(correctValue), 1)) * 100;
        
        // Accuracy points: Linear scale from 100% (0 points) to 0% (1000 points)
        // If more than 100% off, you get 0 accuracy points
        if (percentageOff <= 100) {
          accuracyPoints = Math.round(maxAccuracyPoints * (1 - percentageOff / 100));
        } else {
          accuracyPoints = 0;
        }
        
        // Rank bonus (smaller than before, just a tie-breaker)
        rankBonus = index < rankBonuses.length ? rankBonuses[index] : baseRankBonus;
        
        // Perfect answer bonus
        if (entry.absDiff === 0) {
          perfect = perfectBonus;
        }
        
        entry.player.streak++;
      } else {
        entry.player.streak = 0;
      }

      const points = accuracyPoints + rankBonus + perfect;
      entry.player.score += points;
      
      results.push({
        playerId: entry.player.id,
        playerName: entry.player.name,
        avatarSeed: entry.player.avatarSeed,
        correct: entry.absDiff === 0,
        points,
        basePoints: accuracyPoints, // Accuracy-based points
        timeBonus: 0,
        streakBonus: rankBonus, // Reuse field for rank bonus display
        streak: entry.player.streak,
        newScore: entry.player.score,
        answerOrder: answerOrderMap.get(entry.player.id) || null,
        responseTimeMs: entry.player.answerTime 
          ? room.settings.timePerQuestion * 1000 - entry.player.answerTime 
          : null,
        estimation: entry.estimation,
        diff: entry.diff,
        absDiff: entry.estimation !== null ? entry.absDiff : null,
        rank: index + 1,
        accuracyPoints, // NEW: Send accuracy points for UI
        rankBonus, // NEW: Send rank bonus for UI
        perfectBonus: perfect, // NEW: Send perfect bonus for UI
      });
    });

    emitPhaseChange(room, io, 'estimation_reveal');
    io.to(room.code).emit('answer_reveal', {
      correctValue: question.correctValue,
      unit: question.unit,
      results,
    });
    io.to(room.code).emit('room_update', roomToClient(room));
  }

  function proceedAfterReveal(room: GameRoom, io: SocketServer) {
    room.state.currentQuestionIndex++;

    if (room.state.currentQuestionIndex >= room.settings.questionsPerRound) {
      showScoreboard(room, io);
    } else {
      startQuestion(room, io);
    }
  }

  function showScoreboard(room: GameRoom, io: SocketServer) {
    room.state.phase = 'scoreboard';
    room.state.currentQuestion = null;
    room.state.timerEnd = null;

    emitPhaseChange(room, io, 'scoreboard');
    io.to(room.code).emit('room_update', roomToClient(room));
    
    // WICHTIG: currentRound wird NICHT hier erhöht!
    // Die Erhöhung passiert in startCategorySelection, nachdem geprüft wurde
    // ob die aktuelle Runde bereits die letzte war.
  }

  function showFinalResults(room: GameRoom, io: SocketServer) {
    room.state.phase = 'final';
    
    const finalRankings = Array.from(room.players.values())
      .sort((a, b) => b.score - a.score)
      .map((p, i) => ({
        rank: i + 1,
        playerId: p.id,
        name: p.name,
        score: p.score,
        avatarSeed: p.avatarSeed,
      }));

    io.to(room.code).emit('game_over', { rankings: finalRankings });
    io.to(room.code).emit('room_update', roomToClient(room));
    
    // Nach 8 Sekunden (Zeit für Confetti etc.) das Rematch-Voting starten
    setTimeout(() => {
      if (room.state.phase === 'final') {
        startRematchVoting(room, io);
      }
    }, 8000);
  }

  function startRematchVoting(room: GameRoom, io: SocketServer) {
    room.state.phase = 'rematch_voting';
    room.state.rematchVotes = new Map();
    room.state.timerEnd = Date.now() + 20000; // 20 Sekunden zum Voten
    
    console.log(`🗳️ Rematch voting started in room ${room.code}`);
    
    emitPhaseChange(room, io, 'rematch_voting');
    io.to(room.code).emit('rematch_voting_start', {
      timerEnd: room.state.timerEnd,
    });
    io.to(room.code).emit('room_update', roomToClient(room));
    
    // Timeout für Voting
    setTimeout(() => {
      if (room.state.phase === 'rematch_voting') {
        // Alle die nicht gevotet haben, zählen als "nein"
        const connectedPlayers = Array.from(room.players.values()).filter(p => p.isConnected);
        connectedPlayers.forEach(p => {
          if (!room.state.rematchVotes.has(p.id)) {
            room.state.rematchVotes.set(p.id, 'no');
          }
        });
        finalizeRematchVoting(room, io);
      }
    }, 20000);
  }

  function finalizeRematchVoting(room: GameRoom, io: SocketServer) {
    const votes = room.state.rematchVotes;
    const yesVoters: string[] = [];
    const noVoters: string[] = [];
    
    votes.forEach((vote, playerId) => {
      if (vote === 'yes') yesVoters.push(playerId);
      else noVoters.push(playerId);
    });
    
    console.log(`🗳️ Rematch voting result: ${yesVoters.length} yes, ${noVoters.length} no`);
    
    if (yesVoters.length === 0) {
      // Niemand will weiterspielen - Raum schließen
      io.to(room.code).emit('rematch_result', {
        rematch: false,
        message: 'Niemand wollte weiterspielen. Danke fürs Spielen!',
      });
      
      // Clean up after a short delay
      setTimeout(() => {
        if (dev) {
          botManager.cleanupRoom(room.code);
        }
        rooms.delete(room.code);
        console.log(`🗑️ Room ${room.code} closed after rematch voting`);
      }, 5000);
      return;
    }
    
    // Mindestens einer will weiterspielen - zurück zur Lobby
    // Neuer Host: Alter Host wenn er "ja" gesagt hat, sonst erster Ja-Sager
    let newHostId = room.hostId;
    const currentHost = room.players.get(room.hostId);
    
    if (!currentHost || !currentHost.isConnected || votes.get(room.hostId) !== 'yes') {
      // Alter Host spielt nicht mit - neuen Host wählen
      newHostId = yesVoters[0];
    }
    
    // Spieler die "nein" gesagt haben, entfernen
    noVoters.forEach(playerId => {
      const player = room.players.get(playerId);
      if (player) {
        // Benachrichtige den Spieler bevor er entfernt wird
        const playerSocket = Array.from(io.sockets.sockets.values())
          .find(s => s.id === player.socketId);
        if (playerSocket) {
          playerSocket.emit('kicked_from_room', { reason: 'Du hast gegen eine weitere Runde gestimmt.' });
          playerSocket.leave(room.code);
        }
      }
      room.players.delete(playerId);
    });
    
    // Host-Status aktualisieren
    room.players.forEach(p => p.isHost = false);
    const newHost = room.players.get(newHostId);
    if (newHost) {
      newHost.isHost = true;
      room.hostId = newHostId;
    }
    
    // Scores und Streaks zurücksetzen
    room.players.forEach(p => {
      p.score = 0;
      p.streak = 0;
      p.currentAnswer = null;
      p.estimationAnswer = null;
      p.answerTime = null;
    });
    
    // Spielstatus zurücksetzen
    room.state = {
      phase: 'lobby',
      currentRound: 1,
      currentQuestionIndex: 0,
      currentQuestion: null,
      categorySelectionMode: null,
      votingCategories: [],
      categoryVotes: new Map(),
      selectedCategory: null,
      roundQuestions: [],
      timerEnd: null,
      showingCorrectAnswer: false,
      loserPickPlayerId: null,
      lastLoserPickRound: 0,
      diceRoyale: null,
      rpsDuel: null,
      bonusRound: null,
      wheelSelectedIndex: null,
      usedQuestionIds: new Set(),
      usedBonusQuestionIds: new Set(),
      rematchVotes: new Map(),
    };
    
    console.log(`🔄 Room ${room.code} reset for rematch. New host: ${newHost?.name}, ${room.players.size} players remaining`);
    
    io.to(room.code).emit('rematch_result', {
      rematch: true,
      newHostId,
      newHostName: newHost?.name,
      remainingPlayers: Array.from(room.players.values()).map(p => ({
        id: p.id,
        name: p.name,
        avatarSeed: p.avatarSeed,
      })),
    });
    
    emitPhaseChange(room, io, 'lobby');
    io.to(room.code).emit('room_update', roomToClient(room));
  }

  // ============================================
  // BONUS ROUND LOGIC
  // ============================================

  interface BonusRoundConfig {
    topic: string;
    description?: string;
    category?: string;
    categoryIcon?: string;
    questionType?: string; // z.B. "Liste", "Sortieren"
    items: Array<{ id: string; display: string; aliases: string[]; group?: string }>;
    timePerTurn?: number;
    fuzzyThreshold?: number;
    pointsPerCorrect?: number;
  }

  function startBonusRound(room: GameRoom, io: SocketServer, config: BonusRoundConfig) {
    // Sort players by score (worst to best) for turn order
    const sortedPlayers = Array.from(room.players.values())
      .filter(p => p.isConnected)
      .sort((a, b) => a.score - b.score);
    
    const turnOrder = sortedPlayers.map(p => p.id);

    room.state.bonusRound = {
      phase: 'intro',
      topic: config.topic,
      description: config.description,
      category: config.category,
      categoryIcon: config.categoryIcon,
      questionType: config.questionType || 'Liste',
      items: config.items.map(item => ({
        id: item.id,
        display: item.display,
        aliases: item.aliases,
        group: item.group,
      })),
      guessedIds: new Set(),
      currentTurnIndex: 0,
      playerCorrectCounts: new Map(),
      currentTurnTimer: null,
      turnOrder,
      activePlayers: [...turnOrder],
      eliminatedPlayers: [],
      pointsPerCorrect: config.pointsPerCorrect ?? 200,
      timePerTurn: config.timePerTurn ?? 15,
      fuzzyThreshold: config.fuzzyThreshold ?? 0.85,
      turnNumber: 0,
    };

    room.state.phase = 'bonus_round';
    emitPhaseChange(room, io, 'bonus_round');
    io.to(room.code).emit('room_update', roomToClient(room));

    // After intro delay, start playing
    setTimeout(() => {
      if (room.state.bonusRound) {
        room.state.bonusRound.phase = 'playing';
        startBonusRoundTurn(room, io);
      }
    }, 3000);
  }

  function startBonusRoundTurn(room: GameRoom, io: SocketServer) {
    const bonusRound = room.state.bonusRound;
    if (!bonusRound || bonusRound.activePlayers.length === 0) return;

    // Clear any existing timer
    if (bonusRound.currentTurnTimer) {
      clearTimeout(bonusRound.currentTurnTimer);
    }

    bonusRound.turnNumber++;
    bonusRound.currentTurnIndex = bonusRound.currentTurnIndex % bonusRound.activePlayers.length;
    
    const currentPlayerId = bonusRound.activePlayers[bonusRound.currentTurnIndex];
    const player = room.players.get(currentPlayerId);
    
    // Set timer
    room.state.timerEnd = Date.now() + (bonusRound.timePerTurn * 1000);
    
    console.log(`🎯 Bonus Round Turn ${bonusRound.turnNumber}: ${player?.name}'s turn (${bonusRound.timePerTurn}s)`);
    
    io.to(room.code).emit('bonus_round_turn', {
      playerId: currentPlayerId,
      playerName: player?.name,
      turnNumber: bonusRound.turnNumber,
      timerEnd: room.state.timerEnd,
    });
    io.to(room.code).emit('room_update', roomToClient(room));

    // Notify bots if it's their turn
    if (dev) {
      botManager.onBonusRoundTurn(room.code, currentPlayerId);
    }

    // Set timeout for this turn
    bonusRound.currentTurnTimer = setTimeout(() => {
      handleBonusRoundTimeout(room, io, currentPlayerId);
    }, bonusRound.timePerTurn * 1000);
  }

  function handleBonusRoundAnswer(room: GameRoom, io: SocketServer, playerId: string, answer: string) {
    const bonusRound = room.state.bonusRound;
    if (!bonusRound) return;

    // Clear timer
    if (bonusRound.currentTurnTimer) {
      clearTimeout(bonusRound.currentTurnTimer);
      bonusRound.currentTurnTimer = null;
    }

    const player = room.players.get(playerId);
    if (!player) return;

    // Check the answer using fuzzy matching
    const result = fuzzyCheckAnswer(
      answer,
      bonusRound.items,
      bonusRound.guessedIds,
      bonusRound.fuzzyThreshold
    );

    console.log(`🎯 ${player.name} answered: "${answer}" -> ${result.matchType} (${(result.confidence * 100).toFixed(0)}%)`);

    if (result.alreadyGuessed) {
      // Already guessed - player is eliminated
      bonusRound.lastGuess = {
        playerId,
        playerName: player.name,
        input: answer,
        result: 'already_guessed',
        matchedDisplay: result.matchedDisplay || undefined,
        confidence: result.confidence,
      };
      eliminatePlayer(room, io, playerId, 'wrong');
    } else if (result.isMatch && result.matchedItemId) {
      // Correct answer!
      bonusRound.guessedIds.add(result.matchedItemId);
      
      // Update the item with who guessed it
      const item = bonusRound.items.find(i => i.id === result.matchedItemId);
      if (item) {
        item.guessedBy = playerId;
        item.guessedByName = player.name;
        item.guessedAt = Date.now();
      }

      // Award points
      player.score += bonusRound.pointsPerCorrect;
      
      // Track correct answer count for this player
      const currentCount = bonusRound.playerCorrectCounts.get(playerId) || 0;
      bonusRound.playerCorrectCounts.set(playerId, currentCount + 1);

      bonusRound.lastGuess = {
        playerId,
        playerName: player.name,
        input: answer,
        result: 'correct',
        matchedDisplay: result.matchedDisplay || undefined,
        confidence: result.confidence,
      };

      io.to(room.code).emit('bonus_round_correct', {
        playerId,
        playerName: player.name,
        itemId: result.matchedItemId,
        itemDisplay: result.matchedDisplay,
        points: bonusRound.pointsPerCorrect,
        newScore: player.score,
        confidence: result.confidence,
        matchType: result.matchType,
      });

      // Check if all items have been guessed
      if (bonusRound.guessedIds.size >= bonusRound.items.length) {
        endBonusRound(room, io, 'all_guessed');
        return;
      }

      // Move to next player
      bonusRound.currentTurnIndex = (bonusRound.currentTurnIndex + 1) % bonusRound.activePlayers.length;
      
      io.to(room.code).emit('room_update', roomToClient(room));
      
      // Small delay before next turn
      setTimeout(() => {
        startBonusRoundTurn(room, io);
      }, 1500);
    } else {
      // Wrong answer - player is eliminated
      bonusRound.lastGuess = {
        playerId,
        playerName: player.name,
        input: answer,
        result: 'wrong',
        confidence: result.confidence,
      };
      eliminatePlayer(room, io, playerId, 'wrong');
    }
  }

  function handleBonusRoundSkip(room: GameRoom, io: SocketServer, playerId: string) {
    const bonusRound = room.state.bonusRound;
    if (!bonusRound) return;

    // Clear timer
    if (bonusRound.currentTurnTimer) {
      clearTimeout(bonusRound.currentTurnTimer);
      bonusRound.currentTurnTimer = null;
    }

    const player = room.players.get(playerId);
    if (!player) return;

    console.log(`⏭️ ${player.name} skipped their turn`);

    bonusRound.lastGuess = {
      playerId,
      playerName: player.name,
      input: '',
      result: 'skip',
    };

    eliminatePlayer(room, io, playerId, 'skip');
  }

  function handleBonusRoundTimeout(room: GameRoom, io: SocketServer, playerId: string) {
    const bonusRound = room.state.bonusRound;
    if (!bonusRound) return;

    const player = room.players.get(playerId);
    if (!player) return;

    console.log(`⏰ ${player.name} timed out`);

    bonusRound.lastGuess = {
      playerId,
      playerName: player.name,
      input: '',
      result: 'timeout',
    };

    eliminatePlayer(room, io, playerId, 'timeout');
  }

  function eliminatePlayer(room: GameRoom, io: SocketServer, playerId: string, reason: 'wrong' | 'timeout' | 'skip') {
    const bonusRound = room.state.bonusRound;
    if (!bonusRound) return;

    const player = room.players.get(playerId);
    if (!player) return;

    // Remove from active players
    const playerIndex = bonusRound.activePlayers.indexOf(playerId);
    if (playerIndex === -1) return;

    bonusRound.activePlayers.splice(playerIndex, 1);

    // Calculate rank (higher = worse, as they were eliminated earlier)
    // Rank = total players - already eliminated = position from bottom
    // First eliminated gets highest rank (worst), last standing gets rank 1 (best)
    const totalPlayers = bonusRound.turnOrder.length;
    const rank = totalPlayers - bonusRound.eliminatedPlayers.length;

    bonusRound.eliminatedPlayers.push({
      playerId,
      playerName: player.name,
      avatarSeed: player.avatarSeed,
      eliminationReason: reason,
      rank,
    });

    io.to(room.code).emit('bonus_round_eliminate', {
      playerId,
      playerName: player.name,
      reason,
      rank,
      remainingPlayers: bonusRound.activePlayers.length,
    });

    console.log(`❌ ${player.name} eliminated (${reason}). ${bonusRound.activePlayers.length} players remaining.`);

    // Check if only one player remains (winner)
    if (bonusRound.activePlayers.length <= 1) {
      endBonusRound(room, io, 'last_standing');
      return;
    }

    // Adjust turn index if needed
    if (playerIndex <= bonusRound.currentTurnIndex) {
      bonusRound.currentTurnIndex = Math.max(0, bonusRound.currentTurnIndex - 1);
    }
    bonusRound.currentTurnIndex = bonusRound.currentTurnIndex % bonusRound.activePlayers.length;

    io.to(room.code).emit('room_update', roomToClient(room));

    // Small delay before next turn
    setTimeout(() => {
      startBonusRoundTurn(room, io);
    }, 2000);
  }

  function endBonusRound(room: GameRoom, io: SocketServer, reason: 'last_standing' | 'all_guessed') {
    const bonusRound = room.state.bonusRound;
    if (!bonusRound) return;

    // Clear any timer
    if (bonusRound.currentTurnTimer) {
      clearTimeout(bonusRound.currentTurnTimer);
      bonusRound.currentTurnTimer = null;
    }

    bonusRound.phase = 'finished';

    // Award bonus points to winners (remaining active players)
    const winners = bonusRound.activePlayers;
    const winnerBonus = winners.length === 1 ? 500 : 250; // More bonus if sole winner
    
    winners.forEach((playerId, index) => {
      const player = room.players.get(playerId);
      if (player) {
        player.score += winnerBonus;
        
        // Add to eliminated with rank 1 (or tied for 1st)
        bonusRound.eliminatedPlayers.push({
          playerId,
          playerName: player.name,
          avatarSeed: player.avatarSeed,
          eliminationReason: 'skip', // Not really eliminated, but we reuse the structure
          rank: 1,
        });
      }
    });

    // Re-sort eliminated players by rank
    bonusRound.eliminatedPlayers.sort((a, b) => a.rank - b.rank);

    // Calculate detailed points breakdown for all players
    const playerScoreBreakdown: Array<{
      playerId: string;
      playerName: string;
      avatarSeed: string;
      correctAnswers: number;
      correctPoints: number;
      rankBonus: number;
      totalPoints: number;
      rank: number;
    }> = [];

    // Get all players who participated (from turnOrder)
    bonusRound.turnOrder.forEach(playerId => {
      const player = room.players.get(playerId);
      if (!player) return;
      
      const correctAnswers = bonusRound.playerCorrectCounts.get(playerId) || 0;
      const correctPoints = correctAnswers * bonusRound.pointsPerCorrect;
      
      // Check if this player is a winner
      const isWinner = winners.includes(playerId);
      const rankBonus = isWinner ? winnerBonus : 0;
      
      // Find their rank
      const eliminatedEntry = bonusRound.eliminatedPlayers.find(e => e.playerId === playerId);
      const rank = eliminatedEntry?.rank || 999;
      
      playerScoreBreakdown.push({
        playerId,
        playerName: player.name,
        avatarSeed: player.avatarSeed,
        correctAnswers,
        correctPoints,
        rankBonus,
        totalPoints: correctPoints + rankBonus,
        rank,
      });
    });

    // Sort by rank
    playerScoreBreakdown.sort((a, b) => a.rank - b.rank);

    console.log(`🏆 Bonus Round ended (${reason}). Winners: ${winners.map(id => room.players.get(id)?.name).join(', ')}`);
    console.log(`📊 Score breakdown:`, playerScoreBreakdown.map(p => `${p.playerName}: ${p.correctAnswers}x${bonusRound.pointsPerCorrect}=${p.correctPoints} + ${p.rankBonus} rank = ${p.totalPoints}`));

    io.to(room.code).emit('bonus_round_end', {
      reason,
      winners: winners.map(id => {
        const p = room.players.get(id);
        return { playerId: id, playerName: p?.name, avatarSeed: p?.avatarSeed };
      }),
      winnerBonus,
      pointsPerCorrect: bonusRound.pointsPerCorrect,
      totalRevealed: bonusRound.guessedIds.size,
      totalItems: bonusRound.items.length,
      rankings: bonusRound.eliminatedPlayers,
      playerScoreBreakdown,
    });

    room.state.phase = 'bonus_round_result';
    room.state.timerEnd = null;
    io.to(room.code).emit('room_update', roomToClient(room));

    // Auto-advance after showing results
    setTimeout(() => {
      // Nach der Bonusrunde zum Scoreboard, dort kann der Host dann "Weiter" drücken
      // Die Rundenerhöhung und Finale-Prüfung passiert dann in startCategorySelection
      showScoreboard(room, io);
    }, 8000);
  }

  // ============================================
  // NEXT.JS HANDLER
  // ============================================

  expressApp.all('/{*path}', (req: Request, res: Response) => {
    return handle(req, res);
  });

  // ============================================
  // START
  // ============================================

  httpServer.listen(port, () => {
    console.log(`
╔══════════════════════════════════════════╗
║   🎮 NerdQuiz Server                     ║
║   📍 http://${hostname}:${port}               ║
║   🔌 WebSocket ready                     ║
╚══════════════════════════════════════════╝
    `);
  });
});
