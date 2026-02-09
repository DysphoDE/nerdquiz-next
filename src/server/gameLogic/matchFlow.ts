/**
 * Match Flow Logic
 * 
 * Enthält die Logik für:
 * - Kategorie-Auswahl starten (Entry Point für Runden)
 * - Scoreboard anzeigen
 * - Finale anzeigen
 * - Rematch Voting
 */

import type { Server as SocketServer } from 'socket.io';
import type { GameRoom, BonusRoundConfig } from '../types';
import { 
  getConnectedPlayers,
  getLoserPlayer,
  getRoom,
  resetPlayerScores,
  roomToClient,
  emitPhaseChange,
  broadcastRoomUpdate,
  cleanupRoom,
  createInitialGameState,
} from '../roomStore';
import { botManager } from '../botManager';
import * as questionLoader from '../questionLoader';
import {
  UI_TIMING,
  GAME_TIMERS,
} from '@/config/constants';
import { generateScoreboardAnnouncement } from './scoreboardAnnouncement';
import { generateAndCache } from '../ttsService';
import {
  selectCategoryMode,
  getRandomCategoriesForVoting,
  startCategoryVoting,
  startCategoryWheel,
  startLosersPick,
  startDiceRoyale,
  startRPSDuel,
} from './categorySelection';
import { startBonusRound } from './bonusRound';
import { IMPLEMENTED_BONUS_TYPES_DATA, selectRandomCategoryMode } from '@/config/gameModes.shared';
import type { CustomRoundConfig, RoundType } from '@/config/customGame.shared';

const dev = process.env.NODE_ENV !== 'production';

// ============================================
// GAME START ANIMATION HELPER
// ============================================

/**
 * Verzögert eine Aktion bis der Client die Game-Start-Animation abgeschlossen hat.
 * Bei normalem Rundenübergang (nicht Game-Start) wird direkt gestartet.
 *
 * @param room - Der GameRoom
 * @param action - Die Aktion nach der Animation (z.B. Roulette-Timer starten)
 * @param isGameStart - true wenn dies der erste Aufruf nach Spielstart ist
 */
function schedulePostAnnouncementAction(
  room: GameRoom,
  action: () => void,
  isGameStart: boolean
): void {
  if (isGameStart) {
    // Wait for client to signal that the game start overlay is done
    room.gameStartReadyCallback = () => {
      setTimeout(action, UI_TIMING.WHEEL_ANIMATION);
    };
    room.gameStartReadyTimeout = setTimeout(() => {
      if (room.gameStartReadyCallback) {
        console.log(`⏰ Game start ready timeout reached for room ${room.code}, proceeding anyway`);
        room.gameStartReadyCallback();
        room.gameStartReadyCallback = undefined;
        room.gameStartReadyTimeout = undefined;
      }
    }, UI_TIMING.GAME_START_MAX_WAIT);
  } else {
    setTimeout(action, UI_TIMING.WHEEL_ANIMATION);
  }
}

// ============================================
// BONUS QUESTION LOADERS (Strategy Pattern)
// ============================================

/**
 * Mapping von Bonus-Typ zu Loader-Funktion
 * Macht es einfach, neue Bonus-Typen hinzuzufügen ohne if-else Ketten
 */
type QuestionLoaderFn = (excludeIds: string[], count?: number) => Promise<any | null>;

const BONUS_QUESTION_LOADERS: Record<string, QuestionLoaderFn> = {
  'hot_button': (excludeIds, count = 5) => questionLoader.getRandomHotButtonQuestions(excludeIds, count),
  'collective_list': (excludeIds) => questionLoader.getRandomBonusRoundQuestion(excludeIds),
  // Zukünftige Typen hier einfach hinzufügen:
  // 'sorting': (excludeIds) => questionLoader.getRandomSortingQuestions(excludeIds),
  // 'matching': (excludeIds) => questionLoader.getRandomMatchingQuestions(excludeIds),
};

// ============================================
// BONUS ROUND TYPE SELECTION
// ============================================

/**
 * Wählt intelligent den nächsten Bonus-Typ aus
 * - Priorität für noch nicht gespielte Typen
 * - Reset wenn alle Typen gespielt wurden
 * - Funktioniert mit beliebig vielen Bonus-Typen
 */
function selectBonusType(room: GameRoom): string {
  const availableTypes = IMPLEMENTED_BONUS_TYPES_DATA.map(t => t.id);
  
  if (availableTypes.length === 0) {
    return 'collective_list'; // Fallback
  }
  
  if (availableTypes.length === 1) {
    return availableTypes[0]; // Nur ein Typ verfügbar
  }
  
  // Auto-Reset wenn alle Typen gespielt wurden
  if (room.state.usedBonusTypes.size >= availableTypes.length) {
    console.log(`♻️ All ${availableTypes.length} bonus types played, resetting pool for variety`);
    room.state.usedBonusTypes.clear();
  }
  
  // Filter: Noch nicht gespielte Typen
  const unusedTypes = availableTypes.filter(type => !room.state.usedBonusTypes.has(type));
  
  // Wenn noch ungespielte Typen existieren, wähle daraus
  if (unusedTypes.length > 0) {
    const randomIndex = Math.floor(Math.random() * unusedTypes.length);
    return unusedTypes[randomIndex];
  }
  
  // Fallback (sollte nie passieren nach Reset)
  const randomIndex = Math.floor(Math.random() * availableTypes.length);
  return availableTypes[randomIndex];
}

// ============================================
// CUSTOM GAME MODE HELPERS
// ============================================

/**
 * Startet eine spezifische Bonusrunde nach Typ
 */
async function startBonusRoundByType(
  room: GameRoom,
  io: SocketServer,
  bonusType: 'hot_button' | 'collective_list',
  isGameStart = false,
  specificQuestionId?: string
): Promise<boolean> {
  const excludeIds = Array.from(room.state.usedBonusQuestionIds);
  const hotButtonCount = room.settings.hotButtonQuestionsPerRound || 5;

  // Try loading a specific question first (custom game mode)
  let bonusQuestion: any = null;
  if (specificQuestionId && bonusType === 'collective_list') {
    bonusQuestion = await questionLoader.getSpecificBonusRoundQuestion(specificQuestionId);
    if (!bonusQuestion) {
      console.log(`⚠️ Specific question ${specificQuestionId} not found, falling back to random`);
    }
  }

  // Load random question if no specific one was requested or found
  if (!bonusQuestion) {
    const loader = BONUS_QUESTION_LOADERS[bonusType];
    bonusQuestion = loader ? await loader(excludeIds, hotButtonCount) : null;
  }
  
  if (!bonusQuestion) {
    console.log(`⚠️ No ${bonusType} questions available`);
    return false;
  }
  
  // Add all used question IDs to the set
  if (bonusQuestion.questionIds) {
    bonusQuestion.questionIds.forEach((id: string) => room.state.usedBonusQuestionIds.add(id));
  } else if (bonusQuestion.id) {
    room.state.usedBonusQuestionIds.add(bonusQuestion.id);
  }
  
  // Mark this type as used for variety tracking
  room.state.usedBonusTypes.add(bonusType);
  console.log(`✅ Bonus type '${bonusType}' marked as used. Total used: ${room.state.usedBonusTypes.size}`);
  
  // Show bonus round announcement with roulette
  room.state.phase = 'bonus_round_announcement';
  room.state.categorySelectionMode = null;
  room.state.selectedBonusType = bonusType;
  
  // Store pending question
  room.pendingBonusQuestion = {
    type: bonusQuestion.type || 'collective_list',
    id: bonusQuestion.id,
    topic: bonusQuestion.topic,
    description: bonusQuestion.description,
    category: bonusQuestion.category,
    categoryIcon: bonusQuestion.categoryIcon,
    questionType: bonusQuestion.questionType,
    items: bonusQuestion.items,
    timePerTurn: bonusQuestion.timePerTurn,
    pointsPerCorrect: bonusQuestion.pointsPerCorrect,
    fuzzyThreshold: bonusQuestion.fuzzyThreshold,
    questions: bonusQuestion.questions,
    buzzerTimeout: bonusQuestion.buzzerTimeout,
    answerTimeout: bonusQuestion.answerTimeout,
    allowRebuzz: bonusQuestion.allowRebuzz,
    maxRebuzzAttempts: bonusQuestion.maxRebuzzAttempts,
  };
  
  // Generate snippet index for synchronized welcome audio across clients
  room.state.snippetIndex = Math.floor(Math.random() * 10000);

  emitPhaseChange(room, io, 'bonus_round_announcement');
  broadcastRoomUpdate(room, io);

  // After roulette animation, start bonus round
  const roomCode = room.code;
  schedulePostAnnouncementAction(room, () => {
    const currentRoom = getRoom(roomCode);
    if (!currentRoom || currentRoom.state.phase !== 'bonus_round_announcement') return;

    const pendingQuestion = currentRoom.pendingBonusQuestion;
    delete currentRoom.pendingBonusQuestion;

    if (pendingQuestion) {
      startBonusRound(currentRoom, io, pendingQuestion);
    }
  }, isGameStart);

  return true;
}

/**
 * Startet eine Custom-Runde basierend auf der Konfiguration
 */
async function startCustomRound(
  room: GameRoom,
  io: SocketServer,
  roundConfig: CustomRoundConfig,
  isGameStart = false
): Promise<void> {
  console.log(`🎮 Starting custom round: type=${roundConfig.type}, categoryMode=${roundConfig.categoryMode || 'N/A'}`);

  switch (roundConfig.type) {
    case 'hot_button': {
      const success = await startBonusRoundByType(room, io, 'hot_button', isGameStart);
      if (!success) {
        console.log(`⚠️ Hot Button not available, falling back to question round`);
        await startQuestionRound(room, io, 'random', isGameStart);
      }
      break;
    }

    case 'collective_list': {
      const success = await startBonusRoundByType(room, io, 'collective_list', isGameStart, roundConfig.specificQuestionId);
      if (!success) {
        console.log(`⚠️ Collective List not available, falling back to question round`);
        await startQuestionRound(room, io, 'random', isGameStart);
      }
      break;
    }

    case 'question_round':
    default: {
      await startQuestionRound(room, io, roundConfig.categoryMode || 'random', isGameStart);
      break;
    }
  }
}

/**
 * Startet eine normale Fragerunde mit dem angegebenen Kategorie-Modus
 */
async function startQuestionRound(
  room: GameRoom,
  io: SocketServer,
  categoryMode: string,
  isGameStart = false
): Promise<void> {
  // Kategorie-Modus bestimmen
  let mode: string;
  
  if (categoryMode === 'random') {
    // Nutze die standard zufällige Auswahl
    mode = selectCategoryMode(room);
  } else {
    // Erzwinge den spezifischen Modus
    mode = categoryMode;
  }
  
  room.state.categorySelectionMode = mode as any;
  room.state.votingCategories = await getRandomCategoriesForVoting(room, 8);
  room.state.categoryVotes = new Map();
  room.state.selectedCategory = null;
  room.state.loserPickPlayerId = null;

  console.log(`🎲 Round ${room.state.currentRound}: Category mode = ${mode} (requested: ${categoryMode})`);

  // First show announcement
  room.state.phase = 'category_announcement';
  // Generate snippet index for synchronized welcome audio across clients
  room.state.snippetIndex = Math.floor(Math.random() * 10000);

  let announcementData: Record<string, any> = { mode };
  
  if (mode === 'losers_pick') {
    const loser = getLoserPlayer(room);
    if (loser) {
      room.state.loserPickPlayerId = loser.id;
      room.state.lastLoserPickRound = room.state.currentRound;
      announcementData.loserPlayerId = loser.id;
      announcementData.loserPlayerName = loser.name;
    } else {
      // Fallback to voting
      room.state.categorySelectionMode = 'voting';
      announcementData.mode = 'voting';
    }
  }

  io.to(room.code).emit('category_mode', announcementData);
  broadcastRoomUpdate(room, io);

  // After announcement + roulette, start selection
  const roomCode = room.code;
  const expectedMode = room.state.categorySelectionMode;
  schedulePostAnnouncementAction(room, () => {
    const currentRoom = getRoom(roomCode);
    if (!currentRoom || currentRoom.state.phase !== 'category_announcement') return;

    switch (expectedMode) {
      case 'voting':
        startCategoryVoting(currentRoom, io);
        break;
      case 'wheel':
        startCategoryWheel(currentRoom, io);
        break;
      case 'losers_pick':
        startLosersPick(currentRoom, io);
        break;
      case 'dice_royale':
        startDiceRoyale(currentRoom, io);
        break;
      case 'rps_duel':
        startRPSDuel(currentRoom, io);
        break;
      default:
        startCategoryVoting(currentRoom, io);
    }
  }, isGameStart);
}

// ============================================
// START CATEGORY SELECTION (Main Entry Point)
// ============================================

/**
 * Startet die Kategorie-Auswahl für eine Runde
 * Dies ist der Haupt-Entry-Point für jede Runde
 * 
 * Unterstützt sowohl Standard-Modus als auch Custom Game Mode
 */
export async function startCategorySelection(room: GameRoom, io: SocketServer): Promise<void> {
  // === RUNDENERHÖHUNG ===
  const comingFromScoreboard = room.state.phase === 'scoreboard';

  if (comingFromScoreboard) {
    room.state.currentRound++;
    console.log(`📈 Round incremented to ${room.state.currentRound}/${room.settings.maxRounds}`);
  }

  // Detect initial game start (lobby → first round)
  const isGameStart = !comingFromScoreboard && room.state.currentRound === 1;
  if (isGameStart) {
    console.log(`🎬 Game start detected — waiting for client animation before starting timers`);
  }

  // === CUSTOM GAME MODE ===
  if (room.settings.customMode && room.settings.customRounds?.length > 0) {
    const totalCustomRounds = room.settings.customRounds.length;

    // Prüfen ob Spiel vorbei
    if (room.state.currentRound > totalCustomRounds) {
      console.log(`🏁 All ${totalCustomRounds} custom rounds completed, showing final results`);
      showFinalResults(room, io);
      return;
    }

    // Die aktuelle Rundenkonfiguration holen (0-indexed)
    const currentRoundConfig = room.settings.customRounds[room.state.currentRound - 1];
    console.log(`🎯 Custom Mode: Round ${room.state.currentRound}/${totalCustomRounds} - ${currentRoundConfig.type}`);

    await startCustomRound(room, io, currentRoundConfig, isGameStart);
    return;
  }
  
  // === STANDARD MODE ===
  
  // Prüfen ob Spiel vorbei
  if (room.state.currentRound > room.settings.maxRounds) {
    console.log(`🏁 All ${room.settings.maxRounds} rounds completed, showing final results`);
    showFinalResults(room, io);
    return;
  }

  // === BONUSRUNDEN-LOGIK (nur Standard-Modus) ===
  const isLastRound = room.state.currentRound === room.settings.maxRounds;
  const chanceTriggered = room.settings.bonusRoundChance > 0 && Math.random() * 100 < room.settings.bonusRoundChance;
  const shouldBeBonusRound = (isLastRound && room.settings.finalRoundAlwaysBonus) || chanceTriggered;
  
  console.log(`🎮 Round ${room.state.currentRound}/${room.settings.maxRounds} - isLastRound: ${isLastRound}, chanceTriggered: ${chanceTriggered}, shouldBeBonusRound: ${shouldBeBonusRound}`);

  if (shouldBeBonusRound) {
    console.log(`🎯 Round ${room.state.currentRound}: BONUS ROUND triggered!`);
    
    // Smart selection: Choose bonus type that hasn't been played yet
    const selectedBonusType = selectBonusType(room) as 'hot_button' | 'collective_list';
    console.log(`🎰 Selected bonus type: ${selectedBonusType} (used: [${Array.from(room.state.usedBonusTypes).join(', ')}])`);

    // Try to start the selected bonus round
    const success = await startBonusRoundByType(room, io, selectedBonusType, isGameStart);

    if (success) {
      return;
    }

    // Fallback: Try other bonus types
    console.log(`⚠️ No ${selectedBonusType} questions available, trying fallback...`);
    const otherTypes = IMPLEMENTED_BONUS_TYPES_DATA.filter(t => t.id !== selectedBonusType);

    for (const type of otherTypes) {
      const fallbackSuccess = await startBonusRoundByType(room, io, type.id as 'hot_button' | 'collective_list', isGameStart);
      if (fallbackSuccess) {
        console.log(`✅ Fallback successful: Using ${type.id}`);
        return;
      }
    }

    console.log(`⚠️ No bonus round questions found in DB, falling back to normal round`);
  }

  // === NORMALE RUNDE ===
  // Nutze die startQuestionRound Hilfsfunktion für konsistentes Verhalten
  await startQuestionRound(room, io, 'random', isGameStart);
}

// ============================================
// SCOREBOARD
// ============================================

/** Fallback-Timeout für Scoreboard-TTS (30 Sekunden) */
const SCOREBOARD_TTS_FALLBACK = 30000;

/**
 * Zeigt das Scoreboard nach einer Runde.
 * Bei mehreren Spielern wird eine TTS-Ansage generiert und
 * nach Abspielen automatisch zur nächsten Runde gewechselt.
 */
export async function showScoreboard(room: GameRoom, io: SocketServer): Promise<void> {
  room.state.phase = 'scoreboard';
  room.state.currentQuestion = null;
  room.state.timerEnd = null;

  // Generate scoreboard announcement for multi-player games
  const sortedPlayers = Array.from(room.players.values())
    .filter(p => p.isConnected)
    .sort((a, b) => b.score - a.score)
    .map(p => ({ name: p.name, score: p.score }));

  const ttsText = generateScoreboardAnnouncement(sortedPlayers);

  // Pre-generate TTS on server
  let ttsUrl: string | null = null;
  if (ttsText) {
    ttsUrl = await generateAndCache(
      ttsText,
      `scoreboard-${room.code}-${room.state.currentRound}`
    );
  }

  emitPhaseChange(room, io, 'scoreboard');
  broadcastRoomUpdate(room, io);

  if (ttsText) {
    // Send TTS URL to clients (instead of raw text)
    io.to(room.code).emit('scoreboard_announcement', { ttsUrl });

    // Set up callback + fallback for auto-advance after TTS
    const roomCode = room.code;
    room.scoreboardReadyCallback = () => {
      const currentRoom = getRoom(roomCode);
      if (currentRoom && currentRoom.state.phase === 'scoreboard') {
        startCategorySelection(currentRoom, io);
      }
    };
    room.scoreboardReadyTimeout = setTimeout(() => {
      if (room.scoreboardReadyCallback) {
        console.log(`⏰ Scoreboard TTS timeout reached for room ${room.code}, proceeding anyway`);
        const callback = room.scoreboardReadyCallback;
        room.scoreboardReadyCallback = undefined;
        room.scoreboardReadyTimeout = undefined;
        callback();
      }
    }, SCOREBOARD_TTS_FALLBACK);
  }
  // Solo player: no TTS, no auto-advance — host advances manually
}

// ============================================
// FINAL RESULTS
// ============================================

/**
 * Zeigt die finalen Ergebnisse
 */
export function showFinalResults(room: GameRoom, io: SocketServer): void {
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

  // Build statistics for client
  const stats = room.state.statistics;
  
  // Per-player statistics
  const playerStatistics = Array.from(room.players.values()).map(player => {
    const playerStats = stats.playerStats.get(player.id);
    return {
      playerId: player.id,
      playerName: player.name,
      avatarSeed: player.avatarSeed,
      correctAnswers: playerStats?.correctAnswers || 0,
      totalAnswers: playerStats?.totalAnswers || 0,
      accuracy: playerStats && playerStats.totalAnswers > 0 
        ? Math.round((playerStats.correctAnswers / playerStats.totalAnswers) * 100) 
        : 0,
      estimationPoints: playerStats?.estimationPoints || 0,
      estimationQuestions: playerStats?.estimationQuestions || 0,
      fastestAnswer: playerStats?.fastestAnswer || null,
      longestStreak: playerStats?.longestStreak || 0,
    };
  });
  
  // Find best estimator (player with most estimation points)
  const bestEstimator = playerStatistics
    .filter(p => p.estimationQuestions > 0)
    .sort((a, b) => b.estimationPoints - a.estimationPoints)[0] || null;
  
  // Category performance (sorted by accuracy)
  const categoryPerformance = Array.from(stats.categoryPerformance.entries())
    .map(([category, data]) => ({
      category,
      correct: data.correct,
      total: data.total,
      accuracy: data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0,
    }))
    .sort((a, b) => b.accuracy - a.accuracy);
  
  const bestCategory = categoryPerformance[0] || null;
  const worstCategory = categoryPerformance.length > 1 
    ? categoryPerformance[categoryPerformance.length - 1] 
    : null;
  
  // Calculate fastest fingers (players with lowest average response time)
  const fastestFingers = Array.from(room.players.values())
    .map(player => {
      const playerStats = stats.playerStats.get(player.id);
      const responsesCount = playerStats?.responsesCount || 0;
      const totalResponseTime = playerStats?.totalResponseTime || 0;
      const avgResponseTime = responsesCount > 0 
        ? Math.round(totalResponseTime / responsesCount) 
        : null;
      return {
        playerId: player.id,
        playerName: player.name,
        avatarSeed: player.avatarSeed,
        avgResponseTime,
        responsesCount,
      };
    })
    .filter(p => p.avgResponseTime !== null && p.responsesCount >= 3) // At least 3 answers
    .sort((a, b) => (a.avgResponseTime || 0) - (b.avgResponseTime || 0))
    .slice(0, 3);

  io.to(room.code).emit('game_over', { 
    rankings: finalRankings,
    statistics: {
      totalQuestions: stats.totalQuestions,
      playerStatistics,
      bestEstimator: bestEstimator ? {
        playerId: bestEstimator.playerId,
        playerName: bestEstimator.playerName,
        avatarSeed: bestEstimator.avatarSeed,
        points: bestEstimator.estimationPoints,
        questions: bestEstimator.estimationQuestions,
      } : null,
      fastestFingers,
      bestCategory,
      worstCategory,
      categoryPerformance,
    },
  });
  broadcastRoomUpdate(room, io);
  
  // Start rematch voting after delay
  const roomCode = room.code;
  setTimeout(() => {
    const currentRoom = getRoom(roomCode);
    if (currentRoom && currentRoom.state.phase === 'final') {
      startRematchVoting(currentRoom, io);
    }
  }, UI_TIMING.FINAL_RESULTS);
}

// ============================================
// REMATCH VOTING
// ============================================

/**
 * Startet das Rematch-Voting
 */
export function startRematchVoting(room: GameRoom, io: SocketServer): void {
  const roomCode = room.code; // Capture for timer
  room.state.phase = 'rematch_voting';
  room.state.rematchVotes = new Map();
  room.state.timerEnd = Date.now() + GAME_TIMERS.REMATCH_VOTING;
  
  console.log(`🗳️ Rematch voting started in room ${roomCode}`);
  
  emitPhaseChange(room, io, 'rematch_voting');
  io.to(roomCode).emit('rematch_voting_start', {
    timerEnd: room.state.timerEnd,
  });
  broadcastRoomUpdate(room, io);
  
  // Timeout for voting
  setTimeout(() => {
    const currentRoom = getRoom(roomCode);
    if (currentRoom && currentRoom.state.phase === 'rematch_voting') {
      // Count non-voters as "no"
      const connectedPlayers = getConnectedPlayers(currentRoom);
      connectedPlayers.forEach(p => {
        if (!currentRoom.state.rematchVotes.has(p.id)) {
          currentRoom.state.rematchVotes.set(p.id, 'no');
        }
      });
      finalizeRematchVoting(currentRoom, io);
    }
  }, GAME_TIMERS.REMATCH_VOTING);
}

/**
 * Verarbeitet eine Rematch-Stimme
 */
export function handleRematchVote(
  room: GameRoom, 
  io: SocketServer, 
  playerId: string, 
  vote: 'yes' | 'no',
  socket: any
): void {
  const player = room.players.get(playerId);
  if (!player || !player.isConnected) return;
  
  // Already voted?
  if (room.state.rematchVotes.has(playerId)) return;
  
  room.state.rematchVotes.set(playerId, vote);
  
  console.log(`🗳️ ${player.name} voted ${vote} for rematch`);
  
  // If "No" vote, remove player immediately
  if (vote === 'no') {
    socket.emit('kicked_from_room', { reason: 'Du hast gegen eine weitere Runde gestimmt.' });
    socket.leave(room.code);
    player.isConnected = false;
    console.log(`👋 ${player.name} left after voting no`);
  }
  
  io.to(room.code).emit('rematch_vote_update', {
    playerId: playerId,
    playerName: player.name,
    vote: vote,
    totalVotes: room.state.rematchVotes.size,
    totalPlayers: getConnectedPlayers(room).length,
  });
  broadcastRoomUpdate(room, io);
  
  // Check if all connected players have voted
  const connectedPlayers = getConnectedPlayers(room);
  if (room.state.rematchVotes.size >= connectedPlayers.length) {
    finalizeRematchVoting(room, io);
  }
}

/**
 * Finalisiert das Rematch-Voting
 */
export function finalizeRematchVoting(room: GameRoom, io: SocketServer): void {
  const votes = room.state.rematchVotes;
  const yesVoters: string[] = [];
  const noVoters: string[] = [];
  
  votes.forEach((vote, playerId) => {
    if (vote === 'yes') yesVoters.push(playerId);
    else noVoters.push(playerId);
  });
  
  console.log(`🗳️ Rematch voting result: ${yesVoters.length} yes, ${noVoters.length} no`);
  
  if (yesVoters.length === 0) {
    // Nobody wants to continue - close room
    io.to(room.code).emit('rematch_result', {
      rematch: false,
      message: 'Niemand wollte weiterspielen. Danke fürs Spielen!',
    });
    
    setTimeout(() => {
      cleanupRoom(room.code);
    }, UI_TIMING.STANDARD_TRANSITION + 3000); // Extra delay for cleanup warning
    return;
  }
  
  // At least one player wants to continue
  let newHostId = room.hostId;
  const currentHost = room.players.get(room.hostId);
  
  if (!currentHost || !currentHost.isConnected || votes.get(room.hostId) !== 'yes') {
    newHostId = yesVoters[0];
  }
  
  // Remove players who voted "no"
  noVoters.forEach(playerId => {
    const player = room.players.get(playerId);
    if (player) {
      const playerSocket = Array.from((io.sockets as any).sockets.values())
        .find((s: any) => s.id === player.socketId);
      if (playerSocket) {
        (playerSocket as any).emit('kicked_from_room', { reason: 'Du hast gegen eine weitere Runde gestimmt.' });
        (playerSocket as any).leave(room.code);
      }
    }
    room.players.delete(playerId);
  });
  
  // Update host
  room.players.forEach(p => p.isHost = false);
  const newHost = room.players.get(newHostId);
  if (newHost) {
    newHost.isHost = true;
    room.hostId = newHostId;
  }
  
  // Reset scores and game state
  resetPlayerScores(room);
  room.state = createInitialGameState();
  
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
  broadcastRoomUpdate(room, io);
}

