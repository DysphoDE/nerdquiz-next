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
  selectCategoryMode,
  getRandomCategoriesForVoting,
  startCategoryVoting,
  startCategoryWheel,
  startLosersPick,
  startDiceRoyale,
  startRPSDuel,
} from './categorySelection';
import { startBonusRound } from './bonusRound';
import { IMPLEMENTED_BONUS_TYPES_DATA } from '@/config/gameModes.shared';

const dev = process.env.NODE_ENV !== 'production';

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
// START CATEGORY SELECTION (Main Entry Point)
// ============================================

/**
 * Startet die Kategorie-Auswahl für eine Runde
 * Dies ist der Haupt-Entry-Point für jede Runde
 */
export async function startCategorySelection(room: GameRoom, io: SocketServer): Promise<void> {
  // === RUNDENERHÖHUNG ===
  const comingFromScoreboard = room.state.phase === 'scoreboard';
  
  if (comingFromScoreboard) {
    room.state.currentRound++;
    console.log(`📈 Round incremented to ${room.state.currentRound}/${room.settings.maxRounds}`);
  }
  
  // === PRÜFEN OB SPIEL VORBEI ===
  if (room.state.currentRound > room.settings.maxRounds) {
    console.log(`🏁 All ${room.settings.maxRounds} rounds completed, showing final results`);
    showFinalResults(room, io);
    return;
  }

  // === BONUSRUNDEN-LOGIK ===
  const isLastRound = room.state.currentRound === room.settings.maxRounds;
  const chanceTriggered = room.settings.bonusRoundChance > 0 && Math.random() * 100 < room.settings.bonusRoundChance;
  const shouldBeBonusRound = (isLastRound && room.settings.finalRoundAlwaysBonus) || chanceTriggered;
  
  console.log(`🎮 Round ${room.state.currentRound}/${room.settings.maxRounds} - isLastRound: ${isLastRound}, chanceTriggered: ${chanceTriggered}, shouldBeBonusRound: ${shouldBeBonusRound}`);

  if (shouldBeBonusRound) {
    console.log(`🎯 Round ${room.state.currentRound}: BONUS ROUND triggered!`);
    
    // Smart selection: Choose bonus type that hasn't been played yet
    const selectedBonusType = selectBonusType(room);
    console.log(`🎰 Selected bonus type: ${selectedBonusType} (used: [${Array.from(room.state.usedBonusTypes).join(', ')}])`);
    
    // Load appropriate bonus round question from DB
    const excludeIds = Array.from(room.state.usedBonusQuestionIds);
    const hotButtonCount = room.settings.hotButtonQuestionsPerRound || 5;
    
    // Use strategy pattern for loading questions
    const loader = BONUS_QUESTION_LOADERS[selectedBonusType];
    let bonusQuestion = loader ? await loader(excludeIds, hotButtonCount) : null;
    
    // Fallback: If selected type not available, try other types
    if (!bonusQuestion) {
      console.log(`⚠️ No ${selectedBonusType} questions available, trying fallback...`);
      const otherTypes = IMPLEMENTED_BONUS_TYPES_DATA.filter(t => t.id !== selectedBonusType);
      
      for (const type of otherTypes) {
        const fallbackLoader = BONUS_QUESTION_LOADERS[type.id];
        if (fallbackLoader) {
          bonusQuestion = await fallbackLoader(excludeIds, hotButtonCount);
          if (bonusQuestion) {
            console.log(`✅ Fallback successful: Using ${type.id}`);
            break;
          }
        }
      }
    }
    
    if (bonusQuestion) {
      // Add all used question IDs to the set
      if (bonusQuestion.questionIds) {
        bonusQuestion.questionIds.forEach((id: string) => room.state.usedBonusQuestionIds.add(id));
      } else if (bonusQuestion.id) {
        room.state.usedBonusQuestionIds.add(bonusQuestion.id);
      }
      
      // Determine bonus type from questionType
      const bonusType = bonusQuestion.questionType === 'HOT_BUTTON' ? 'hot_button' : 'collective_list';
      
      // Mark this type as used for variety tracking
      room.state.usedBonusTypes.add(bonusType);
      console.log(`✅ Bonus type '${bonusType}' marked as used. Total used: ${room.state.usedBonusTypes.size}`);
      
      // Show bonus round announcement with roulette
      room.state.phase = 'bonus_round_announcement';
      room.state.categorySelectionMode = null;
      room.state.selectedBonusType = bonusType; // Set for roulette display
      
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
        // Hot Button specific fields
        questions: bonusQuestion.questions,
        buzzerTimeout: bonusQuestion.buzzerTimeout,
        answerTimeout: bonusQuestion.answerTimeout,
        allowRebuzz: bonusQuestion.allowRebuzz,
        maxRebuzzAttempts: bonusQuestion.maxRebuzzAttempts,
      };
      
      emitPhaseChange(room, io, 'bonus_round_announcement');
      broadcastRoomUpdate(room, io);
      
      // After roulette animation, start bonus round
      const roomCode = room.code;
      setTimeout(() => {
        const currentRoom = getRoom(roomCode);
        if (!currentRoom || currentRoom.state.phase !== 'bonus_round_announcement') return;
        
        const pendingQuestion = currentRoom.pendingBonusQuestion;
        delete currentRoom.pendingBonusQuestion;
        
        if (pendingQuestion) {
          startBonusRound(currentRoom, io, pendingQuestion);
        }
      }, 5500);
      
      return;
    } else {
      console.log(`⚠️ No bonus round question found in DB, falling back to normal round`);
    }
  }

  // === NORMALE RUNDE ===
  const mode = selectCategoryMode(room);
  room.state.categorySelectionMode = mode;
  room.state.votingCategories = await getRandomCategoriesForVoting(room, 8);
  room.state.categoryVotes = new Map();
  room.state.selectedCategory = null;
  room.state.loserPickPlayerId = null;

  console.log(`🎲 Round ${room.state.currentRound}: Category mode = ${mode}`);

  // First show announcement
  room.state.phase = 'category_announcement';
  
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
  setTimeout(() => {
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
  }, 5500);
}

// ============================================
// SCOREBOARD
// ============================================

/**
 * Zeigt das Scoreboard nach einer Runde
 */
export function showScoreboard(room: GameRoom, io: SocketServer): void {
  room.state.phase = 'scoreboard';
  room.state.currentQuestion = null;
  room.state.timerEnd = null;

  emitPhaseChange(room, io, 'scoreboard');
  broadcastRoomUpdate(room, io);
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
  }, 8000);
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
  room.state.timerEnd = Date.now() + 20000;
  
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
  }, 20000);
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
    }, 5000);
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

