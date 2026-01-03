/**
 * Bonus Round Logic
 * 
 * Enthält die komplette Logik für Bonusrunden:
 * - Collective List (Spieler nennen Begriffe reihum)
 * - Eliminierung bei falscher Antwort
 * - Punktevergabe
 */

import type { Server as SocketServer } from 'socket.io';
import type { 
  GameRoom, 
  BonusRoundConfig, 
  ServerBonusRoundState,
  PlayerScoreBreakdown,
} from '../types';
import { 
  getConnectedPlayers,
  roomToClient,
  emitPhaseChange,
  broadcastRoomUpdate,
} from '../roomStore';
import { botManager } from '../botManager';
import { checkAnswer as fuzzyCheckAnswer } from '@/lib/fuzzyMatch';

const dev = process.env.NODE_ENV !== 'production';

// ============================================
// START BONUS ROUND
// ============================================

/**
 * Startet eine Bonusrunde
 */
export function startBonusRound(room: GameRoom, io: SocketServer, config: BonusRoundConfig): void {
  // Sort players by score (worst to best) for turn order
  const sortedPlayers = getConnectedPlayers(room).sort((a, b) => a.score - b.score);
  const turnOrder = sortedPlayers.map(p => p.id);

  room.state.bonusRound = {
    phase: 'intro',
    questionId: config.id, // Store DB question ID for dev-mode editing
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
  broadcastRoomUpdate(room, io);

  // After intro delay, start playing
  setTimeout(() => {
    if (room.state.bonusRound) {
      room.state.bonusRound.phase = 'playing';
      startBonusRoundTurn(room, io);
    }
  }, 3000);
}

// ============================================
// TURN MANAGEMENT
// ============================================

/**
 * Startet einen neuen Zug in der Bonusrunde
 */
export function startBonusRoundTurn(room: GameRoom, io: SocketServer): void {
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
  broadcastRoomUpdate(room, io);

  // Notify bots if it's their turn
  if (dev) {
    botManager.onBonusRoundTurn(room.code, currentPlayerId);
  }

  // Set timeout for this turn
  bonusRound.currentTurnTimer = setTimeout(() => {
    handleBonusRoundTimeout(room, io, currentPlayerId);
  }, bonusRound.timePerTurn * 1000);
}

// ============================================
// ANSWER HANDLING
// ============================================

/**
 * Verarbeitet eine Antwort in der Bonusrunde
 */
export function handleBonusRoundAnswer(room: GameRoom, io: SocketServer, playerId: string, answer: string): void {
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
    
    broadcastRoomUpdate(room, io);
    
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

/**
 * Verarbeitet ein Skip in der Bonusrunde
 */
export function handleBonusRoundSkip(room: GameRoom, io: SocketServer, playerId: string): void {
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

/**
 * Verarbeitet ein Timeout in der Bonusrunde
 */
export function handleBonusRoundTimeout(room: GameRoom, io: SocketServer, playerId: string): void {
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

// ============================================
// ELIMINATION
// ============================================

/**
 * Eliminiert einen Spieler aus der Bonusrunde
 */
export function eliminatePlayer(
  room: GameRoom, 
  io: SocketServer, 
  playerId: string, 
  reason: 'wrong' | 'timeout' | 'skip'
): void {
  const bonusRound = room.state.bonusRound;
  if (!bonusRound) return;

  const player = room.players.get(playerId);
  if (!player) return;

  // Remove from active players
  const playerIndex = bonusRound.activePlayers.indexOf(playerId);
  if (playerIndex === -1) return;

  bonusRound.activePlayers.splice(playerIndex, 1);

  // Calculate rank (higher = worse)
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

  broadcastRoomUpdate(room, io);

  // Small delay before next turn
  setTimeout(() => {
    startBonusRoundTurn(room, io);
  }, 2000);
}

// ============================================
// END BONUS ROUND
// ============================================

/**
 * Beendet die Bonusrunde und berechnet Punkte
 */
export function endBonusRound(room: GameRoom, io: SocketServer, reason: 'last_standing' | 'all_guessed'): void {
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
  const winnerBonus = winners.length === 1 ? 500 : 250;
  
  winners.forEach((playerId) => {
    const player = room.players.get(playerId);
    if (player) {
      player.score += winnerBonus;
      
      // Add to eliminated with rank 1
      bonusRound.eliminatedPlayers.push({
        playerId,
        playerName: player.name,
        avatarSeed: player.avatarSeed,
        eliminationReason: 'skip', // Not really eliminated
        rank: 1,
      });
    }
  });

  // Re-sort eliminated players by rank
  bonusRound.eliminatedPlayers.sort((a, b) => a.rank - b.rank);

  // Calculate detailed points breakdown
  const playerScoreBreakdown: PlayerScoreBreakdown[] = [];

  bonusRound.turnOrder.forEach(playerId => {
    const player = room.players.get(playerId);
    if (!player) return;
    
    const correctAnswers = bonusRound.playerCorrectCounts.get(playerId) || 0;
    const correctPoints = correctAnswers * bonusRound.pointsPerCorrect;
    
    const isWinner = winners.includes(playerId);
    const rankBonus = isWinner ? winnerBonus : 0;
    
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
  console.log(`📊 Score breakdown:`, playerScoreBreakdown.map(p => 
    `${p.playerName}: ${p.correctAnswers}x${bonusRound.pointsPerCorrect}=${p.correctPoints} + ${p.rankBonus} rank = ${p.totalPoints}`
  ));

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
  broadcastRoomUpdate(room, io);

  // Auto-advance after showing results
  // If this was the last round, go directly to final results
  const isLastRound = room.state.currentRound >= room.settings.maxRounds;
  
  setTimeout(() => {
    if (isLastRound) {
      const { showFinalResults } = require('./matchFlow');
      showFinalResults(room, io);
    } else {
      const { showScoreboard } = require('./matchFlow');
      showScoreboard(room, io);
    }
  }, 8000);
}

