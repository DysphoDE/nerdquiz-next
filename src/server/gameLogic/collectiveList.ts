/**
 * Collective List Bonus Round Logic
 * 
 * Spieler nennen nacheinander Begriffe aus einer Liste.
 * Wer einen falschen Begriff nennt oder die Zeit überschreitet, scheidet aus.
 * Der letzte verbleibende Spieler gewinnt.
 */

import type { Server as SocketServer } from 'socket.io';
import type { 
  GameRoom, 
  BonusRoundConfig, 
  ServerCollectiveListState,
  PlayerScoreBreakdown,
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
// START COLLECTIVE LIST ROUND
// ============================================

/**
 * Startet eine Collective List Bonusrunde
 */
export function startCollectiveListRound(room: GameRoom, io: SocketServer, config: BonusRoundConfig): void {
  const roomCode = room.code;
  
  if (!config.items || config.items.length === 0) {
    console.error('❌ No items provided for Collective List round');
    return;
  }
  
  // Sort players by score (worst to best) for turn order
  const sortedPlayers = getConnectedPlayers(room).sort((a, b) => a.score - b.score);
  const turnOrder = sortedPlayers.map(p => p.id);

  room.state.bonusRound = {
    type: 'collective_list',
    phase: 'intro',
    questionId: config.id,
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
    const { getRoom } = require('../roomStore');
    const currentRoom = getRoom(roomCode);
    if (currentRoom?.state.bonusRound && currentRoom.state.bonusRound.type === 'collective_list' && currentRoom.state.bonusRound.phase === 'intro') {
      currentRoom.state.bonusRound.phase = 'playing';
      startCollectiveListTurn(currentRoom, io);
    }
  }, 3000);
}

// ============================================
// TURN MANAGEMENT
// ============================================

/**
 * Startet einen neuen Zug in der Collective List Runde
 */
export function startCollectiveListTurn(room: GameRoom, io: SocketServer): void {
  const roomCode = room.code;
  const bonusRound = room.state.bonusRound;
  if (!bonusRound || bonusRound.type !== 'collective_list' || bonusRound.activePlayers.length === 0) return;

  // Clear any existing timer
  if (bonusRound.currentTurnTimer) {
    clearTimeout(bonusRound.currentTurnTimer);
  }

  // Remove any disconnected players from active players before starting turn
  bonusRound.activePlayers = bonusRound.activePlayers.filter(playerId => {
    const player = room.players.get(playerId);
    return player?.isConnected;
  });
  
  // Check if we still have active players after filtering
  if (bonusRound.activePlayers.length === 0) {
    endCollectiveListRound(room, io, 'last_standing');
    return;
  }
  
  // In Multi-Player mode: End if only one player remains (winner)
  // In Single-Player mode: Continue playing
  const wasSinglePlayer = bonusRound.turnOrder.length === 1;
  
  if (!wasSinglePlayer && bonusRound.activePlayers.length === 1) {
    // Multi-Player: Only one player left = winner
    endCollectiveListRound(room, io, 'last_standing');
    return;
  }

  bonusRound.turnNumber++;
  bonusRound.currentTurnIndex = bonusRound.currentTurnIndex % bonusRound.activePlayers.length;
  
  const currentPlayerId = bonusRound.activePlayers[bonusRound.currentTurnIndex];
  const player = room.players.get(currentPlayerId);
  
  // Set timer
  room.state.timerEnd = Date.now() + (bonusRound.timePerTurn * 1000);
  const turnNumber = bonusRound.turnNumber;
  
  console.log(`🎯 Collective List Turn ${bonusRound.turnNumber}: ${player?.name}'s turn (${bonusRound.timePerTurn}s)`);
  
  io.to(roomCode).emit('bonus_round_turn', {
    playerId: currentPlayerId,
    playerName: player?.name,
    turnNumber: bonusRound.turnNumber,
    timerEnd: room.state.timerEnd,
  });
  broadcastRoomUpdate(room, io);

  // Notify bots if it's their turn
  if (dev) {
    botManager.onBonusRoundTurn(roomCode, currentPlayerId);
  }

  // Set timeout for this turn
  bonusRound.currentTurnTimer = setTimeout(() => {
    const { getRoom } = require('../roomStore');
    const currentRoom = getRoom(roomCode);
    if (currentRoom?.state.bonusRound && 
        currentRoom.state.bonusRound.type === 'collective_list' &&
        currentRoom.state.bonusRound.turnNumber === turnNumber &&
        currentRoom.state.bonusRound.phase === 'playing') {
      handleCollectiveListTimeout(currentRoom, io, currentPlayerId);
    }
  }, bonusRound.timePerTurn * 1000);
}

// ============================================
// ANSWER HANDLING
// ============================================

/**
 * Verarbeitet eine Antwort in der Collective List Runde
 */
export function handleCollectiveListAnswer(room: GameRoom, io: SocketServer, playerId: string, answer: string): void {
  const bonusRound = room.state.bonusRound;
  if (!bonusRound || bonusRound.type !== 'collective_list') return;

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
    eliminateCollectiveListPlayer(room, io, playerId, 'wrong');
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
      endCollectiveListRound(room, io, 'all_guessed');
      return;
    }

    // Move to next player
    bonusRound.currentTurnIndex = (bonusRound.currentTurnIndex + 1) % bonusRound.activePlayers.length;
    
    broadcastRoomUpdate(room, io);
    
    // Small delay before next turn
    const roomCode = room.code;
    setTimeout(() => {
      const { getRoom } = require('../roomStore');
      const currentRoom = getRoom(roomCode);
      if (currentRoom?.state.bonusRound && currentRoom.state.bonusRound.type === 'collective_list' && currentRoom.state.bonusRound.phase === 'playing') {
        startCollectiveListTurn(currentRoom, io);
      }
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
    eliminateCollectiveListPlayer(room, io, playerId, 'wrong');
  }
}

/**
 * Verarbeitet ein Skip in der Collective List Runde
 */
export function handleCollectiveListSkip(room: GameRoom, io: SocketServer, playerId: string): void {
  const bonusRound = room.state.bonusRound;
  if (!bonusRound || bonusRound.type !== 'collective_list') return;

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

  eliminateCollectiveListPlayer(room, io, playerId, 'skip');
}

/**
 * Verarbeitet ein Timeout in der Collective List Runde
 */
export function handleCollectiveListTimeout(room: GameRoom, io: SocketServer, playerId: string): void {
  const bonusRound = room.state.bonusRound;
  if (!bonusRound || bonusRound.type !== 'collective_list') return;

  const player = room.players.get(playerId);
  if (!player) return;

  console.log(`⏰ ${player.name} timed out`);

  bonusRound.lastGuess = {
    playerId,
    playerName: player.name,
    input: '',
    result: 'timeout',
  };

  eliminateCollectiveListPlayer(room, io, playerId, 'timeout');
}

// ============================================
// ELIMINATION
// ============================================

/**
 * Eliminiert einen Spieler aus der Collective List Runde
 */
export function eliminateCollectiveListPlayer(
  room: GameRoom, 
  io: SocketServer, 
  playerId: string, 
  reason: 'wrong' | 'timeout' | 'skip'
): void {
  const bonusRound = room.state.bonusRound;
  if (!bonusRound || bonusRound.type !== 'collective_list') return;

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

  // Check if game should end
  // In Single-Player mode (only 1 player at start), continue until wrong/skip
  // In Multi-Player mode, end when only 1 player remains (winner)
  const wasSinglePlayer = bonusRound.turnOrder.length === 1;
  
  if (!wasSinglePlayer && bonusRound.activePlayers.length <= 1) {
    // Multi-Player: Last player standing wins
    endCollectiveListRound(room, io, 'last_standing');
    return;
  } else if (wasSinglePlayer && bonusRound.activePlayers.length === 0) {
    // Single-Player: Player eliminated themselves (wrong answer or skip)
    endCollectiveListRound(room, io, 'last_standing');
    return;
  }

  // Adjust turn index if needed
  if (playerIndex <= bonusRound.currentTurnIndex) {
    bonusRound.currentTurnIndex = Math.max(0, bonusRound.currentTurnIndex - 1);
  }
  bonusRound.currentTurnIndex = bonusRound.currentTurnIndex % bonusRound.activePlayers.length;

  broadcastRoomUpdate(room, io);

  // Small delay before next turn
  const roomCode = room.code;
  setTimeout(() => {
    const { getRoom } = require('../roomStore');
    const currentRoom = getRoom(roomCode);
    if (currentRoom?.state.bonusRound && currentRoom.state.bonusRound.type === 'collective_list' && currentRoom.state.bonusRound.phase === 'playing') {
      startCollectiveListTurn(currentRoom, io);
    }
  }, 2000);
}

// ============================================
// END COLLECTIVE LIST ROUND
// ============================================

/**
 * Beendet die Collective List Runde und berechnet Punkte
 */
export function endCollectiveListRound(room: GameRoom, io: SocketServer, reason: 'last_standing' | 'all_guessed'): void {
  const bonusRound = room.state.bonusRound;
  if (!bonusRound || bonusRound.type !== 'collective_list') return;

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

  console.log(`🏆 Collective List ended (${reason}). Winners: ${winners.map(id => room.players.get(id)?.name).join(', ')}`);
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

