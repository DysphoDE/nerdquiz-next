/**
 * Category Selection Logic
 * 
 * Enthält alle Kategorie-Auswahlmodi:
 * - Voting (Abstimmung)
 * - Wheel (Glücksrad)
 * - Loser's Pick (Letztplatzierter wählt)
 * - Dice Royale (Alle würfeln)
 * - RPS Duel (Schere Stein Papier)
 */

import type { Server as SocketServer } from 'socket.io';
import type { 
  GameRoom, 
  CategoryInfo, 
  DiceRoyaleState,
  RPSDuelState,
  RPSChoice,
  CategorySelectionMode,
  GameQuestion,
} from '../types';
import { 
  getRoom,
  getLoserPlayer, 
  getConnectedPlayers,
  rollDie,
  roomToClient,
  emitPhaseChange,
  broadcastRoomUpdate,
} from '../roomStore';
import { botManager } from '../botManager';
import { 
  selectRandomCategoryMode, 
  CATEGORY_MODE_DATA_MAP,
} from '@/config/gameModes.shared';
import * as questionLoader from '../questionLoader';

const dev = process.env.NODE_ENV !== 'production';

// ============================================
// QUESTION LOADING HELPERS
// ============================================

/**
 * Lädt zufällige Kategorien für die Auswahl
 */
export async function getRandomCategoriesForVoting(count: number = 8): Promise<CategoryInfo[]> {
  return questionLoader.getRandomCategoriesForVoting(count);
}

/**
 * Lädt Fragen für einen Raum mit Duplikat-Vermeidung
 */
export async function getQuestionsForRoom(
  room: GameRoom, 
  categoryId: string, 
  count: number
): Promise<GameQuestion[]> {
  const excludeIds = Array.from(room.state.usedQuestionIds);
  const questions = await questionLoader.getRandomQuestions(categoryId, count, excludeIds);
  
  // Track used questions
  for (const q of questions) {
    room.state.usedQuestionIds.add(q.id);
  }
  
  return questions;
}

/**
 * Lädt Kategorie-Daten (Name, Icon)
 */
export async function getCategoryData(categoryId: string): Promise<{ name: string; icon: string } | null> {
  return questionLoader.getCategoryData(categoryId);
}

// ============================================
// CATEGORY MODE SELECTION
// ============================================

/**
 * Wählt einen zufälligen Kategorie-Modus basierend auf Spielerzahl und Cooldowns
 */
export function selectCategoryMode(room: GameRoom): CategorySelectionMode {
  // Check for forced mode (dev command)
  if (room.forcedCategoryMode) {
    const forcedMode = room.forcedCategoryMode;
    delete room.forcedCategoryMode;
    console.log(`🔧 Using forced category mode: ${forcedMode}`);
    return forcedMode;
  }

  const connectedPlayers = getConnectedPlayers(room);
  const playerCount = connectedPlayers.length;
  
  // Build lastModeRounds Map for cooldown checking
  const lastModeRounds = new Map<string, number>();
  if (room.state.lastLoserPickRound > 0) {
    lastModeRounds.set('losers_pick', room.state.lastLoserPickRound);
  }
  
  // Use central config for weighted random selection
  const selectedMode = selectRandomCategoryMode(
    playerCount, 
    lastModeRounds, 
    room.state.currentRound
  );
  
  console.log(`🎯 Selected category mode: ${selectedMode.name} (${selectedMode.id}) for ${playerCount} players`);
  
  return selectedMode.id as CategorySelectionMode;
}

// ============================================
// VOTING
// ============================================

/**
 * Startet die Kategorie-Abstimmung
 */
export function startCategoryVoting(room: GameRoom, io: SocketServer): void {
  room.state.phase = 'category_voting';
  room.state.timerEnd = Date.now() + 15000;

  emitPhaseChange(room, io, 'category_voting');
  broadcastRoomUpdate(room, io);

  setTimeout(() => {
    if (room.state.phase === 'category_voting') {
      finalizeCategoryVoting(room, io);
    }
  }, 15000);
}

/**
 * Finalisiert die Kategorie-Abstimmung
 */
export async function finalizeCategoryVoting(room: GameRoom, io: SocketServer): Promise<void> {
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
        // Import dynamically to avoid circular dependency
        const { startQuestion } = require('./questions');
        startQuestion(room, io);
      }, 2500);
    }, 3000);
  } else {
    io.to(room.code).emit('category_selected', { 
      categoryId: selectedCategoryId,
      categoryName: categoryData?.name,
      categoryIcon: categoryData?.icon,
    });

    setTimeout(() => {
      const { startQuestion } = require('./questions');
      startQuestion(room, io);
    }, 2500);
  }
}

// ============================================
// WHEEL
// ============================================

/**
 * Startet das Glücksrad
 */
export function startCategoryWheel(room: GameRoom, io: SocketServer): void {
  room.state.phase = 'category_wheel';
  
  // The wheel shows max 8 categories
  const WHEEL_SEGMENTS = 8;
  const wheelCategories = room.state.votingCategories.slice(0, WHEEL_SEGMENTS);
  
  // Pre-select a random category
  const selectedIndex = Math.floor(Math.random() * wheelCategories.length);
  const selectedCat = wheelCategories[selectedIndex];
  
  room.state.wheelSelectedIndex = selectedIndex;
  
  console.log(`🎡 Wheel will land on index ${selectedIndex}: ${selectedCat.name}`);
  
  emitPhaseChange(room, io, 'category_wheel');
  broadcastRoomUpdate(room, io);

  // Wheel animation takes ~5 seconds
  setTimeout(() => {
    if (room.state.phase === 'category_wheel') {
      finalizeWheelSelection(room, io, selectedCat.id);
    }
  }, 5500);
}

/**
 * Finalisiert die Glücksrad-Auswahl
 */
export async function finalizeWheelSelection(room: GameRoom, io: SocketServer, categoryId: string): Promise<void> {
  room.state.selectedCategory = categoryId;
  room.state.roundQuestions = await getQuestionsForRoom(room, categoryId, room.settings.questionsPerRound);
  room.state.currentQuestionIndex = 0;
  room.state.wheelSelectedIndex = null;

  const categoryData = await getCategoryData(categoryId);
  
  io.to(room.code).emit('category_selected', { 
    categoryId,
    categoryName: categoryData?.name,
    categoryIcon: categoryData?.icon,
  });

  setTimeout(() => {
    const { startQuestion } = require('./questions');
    startQuestion(room, io);
  }, 2000);
}

// ============================================
// LOSER'S PICK
// ============================================

/**
 * Startet Loser's Pick
 */
export function startLosersPick(room: GameRoom, io: SocketServer): void {
  room.state.phase = 'category_losers_pick';
  room.state.timerEnd = Date.now() + 15000;

  emitPhaseChange(room, io, 'category_losers_pick');
  broadcastRoomUpdate(room, io);

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

/**
 * Finalisiert die Loser's Pick Auswahl
 */
export async function finalizeLosersPick(room: GameRoom, io: SocketServer, categoryId: string): Promise<void> {
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
    const { startQuestion } = require('./questions');
    startQuestion(room, io);
  }, 2500);
}

// ============================================
// DICE ROYALE
// ============================================

/**
 * Startet Dice Royale - alle Spieler würfeln
 */
export function startDiceRoyale(room: GameRoom, io: SocketServer): void {
  room.state.phase = 'category_dice_royale';
  
  const connectedPlayers = getConnectedPlayers(room);
  
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
  broadcastRoomUpdate(room, io);

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

  // Timeout - auto-roll for players who haven't rolled
  setTimeout(() => {
    if (room.state.phase === 'category_dice_royale' && room.state.diceRoyale?.phase === 'rolling') {
      autoRollRemainingPlayers(room, io);
    }
  }, 15500);
}

/**
 * Auto-Roll für Spieler die nicht gewürfelt haben
 */
export function autoRollRemainingPlayers(room: GameRoom, io: SocketServer): void {
  const royale = room.state.diceRoyale;
  if (!royale) return;

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

  setTimeout(() => checkDiceRoyaleResult(room, io), 500);
}

/**
 * Prüft das Dice Royale Ergebnis
 */
export function checkDiceRoyaleResult(room: GameRoom, io: SocketServer): void {
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
    broadcastRoomUpdate(room, io);

    // Reset rolls only for tied players
    setTimeout(() => {
      if (royale.tiedPlayerIds) {
        royale.tiedPlayerIds.forEach(playerId => {
          royale.playerRolls.set(playerId, null);
        });
        royale.phase = 'rolling';
        io.to(room.code).emit('dice_royale_ready');
        broadcastRoomUpdate(room, io);

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

  // Notify bot manager
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
  broadcastRoomUpdate(room, io);

  // After showing winner, let them pick
  setTimeout(() => {
    if (room.state.phase === 'category_dice_royale') {
      startDiceRoyalePick(room, io);
    }
  }, 3000);
}

/**
 * Startet die Kategorie-Auswahl für den Dice Royale Gewinner
 */
export function startDiceRoyalePick(room: GameRoom, io: SocketServer): void {
  room.state.timerEnd = Date.now() + 15000;
  io.to(room.code).emit('dice_royale_pick');
  broadcastRoomUpdate(room, io);

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

/**
 * Finalisiert die Dice Royale Kategorie-Auswahl
 */
export async function finalizeDiceRoyalePick(room: GameRoom, io: SocketServer, categoryId: string): Promise<void> {
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
    const { startQuestion } = require('./questions');
    startQuestion(room, io);
  }, 2500);
}

/**
 * Verarbeitet einen Dice Royale Wurf
 */
export function handleDiceRoyaleRoll(room: GameRoom, io: SocketServer, playerId: string): void {
  const royale = room.state.diceRoyale;
  if (!royale || royale.phase !== 'rolling') return;

  // Check if player is eligible to roll
  if (!royale.playerRolls.has(playerId)) return;
  
  // Check if already rolled
  if (royale.playerRolls.get(playerId) !== null) return;

  // Check if in tie-breaker and player is eligible
  if (royale.tiedPlayerIds && !royale.tiedPlayerIds.includes(playerId)) return;

  // Roll the dice!
  const rolls = [rollDie(), rollDie()];
  royale.playerRolls.set(playerId, rolls);

  const player = room.players.get(playerId);
  console.log(`🎲 ${player?.name} rolled: ${rolls[0]} + ${rolls[1]} = ${rolls[0] + rolls[1]}`);

  io.to(room.code).emit('dice_royale_roll', {
    playerId: playerId,
    rolls: rolls,
  });
  broadcastRoomUpdate(room, io);

  // Check if all eligible players have rolled
  let allRolled = true;
  const eligiblePlayers = royale.tiedPlayerIds || Array.from(royale.playerRolls.keys());
  eligiblePlayers.forEach(pid => {
    if (royale.playerRolls.get(pid) === null) allRolled = false;
  });

  if (allRolled) {
    setTimeout(() => {
      checkDiceRoyaleResult(room, io);
    }, 1500);
  }
}

// ============================================
// RPS DUEL
// ============================================

/**
 * Startet ein RPS Duel (Schere Stein Papier)
 */
export function startRPSDuel(room: GameRoom, io: SocketServer): void {
  room.state.phase = 'category_rps_duel';
  
  const connectedPlayers = getConnectedPlayers(room);
  
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
  broadcastRoomUpdate(room, io);

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

/**
 * Startet eine RPS Runde
 */
export function startRPSRound(room: GameRoom, io: SocketServer): void {
  const duel = room.state.rpsDuel;
  if (!duel) return;

  room.state.timerEnd = Date.now() + 10000;
  io.to(room.code).emit('rps_round_start', { round: duel.currentRound });
  broadcastRoomUpdate(room, io);

  // Timeout - auto-choose
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

/**
 * Löst eine RPS Runde auf
 */
export function resolveRPSRound(room: GameRoom, io: SocketServer): void {
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
    setTimeout(() => {
      const winnerId = duel.player1Wins >= 2 ? duel.player1Id : duel.player2Id;
      finalizeRPSDuelWinner(room, io, winnerId);
    }, 2500);
  } else if (duel.currentRound >= 3) {
    // After 3 rounds, whoever leads wins
    setTimeout(() => {
      let winnerId: string;
      if (duel.player1Wins > duel.player2Wins) {
        winnerId = duel.player1Id;
      } else if (duel.player2Wins > duel.player1Wins) {
        winnerId = duel.player2Id;
      } else {
        // True tie - continue with extra round
        duel.currentRound++;
        duel.phase = 'choosing';
        startRPSRound(room, io);
        return;
      }
      finalizeRPSDuelWinner(room, io, winnerId);
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

/**
 * Finalisiert den RPS Duel Gewinner
 */
function finalizeRPSDuelWinner(room: GameRoom, io: SocketServer, winnerId: string): void {
  const duel = room.state.rpsDuel;
  if (!duel) return;

  duel.winnerId = winnerId;
  duel.phase = 'result';
  room.state.loserPickPlayerId = winnerId;

  const winner = room.players.get(winnerId);
  console.log(`✊✌️✋ RPS Duel Winner: ${winner?.name}`);

  // Notify bot manager
  if (dev) {
    botManager.onRPSDuelWinner(room.code, winnerId);
  }

  io.to(room.code).emit('rps_duel_winner', {
    winnerId,
    winnerName: winner?.name,
    player1Wins: duel.player1Wins,
    player2Wins: duel.player2Wins,
  });
  broadcastRoomUpdate(room, io);

  // Let winner pick
  setTimeout(() => {
    if (room.state.phase === 'category_rps_duel') {
      startRPSDuelPick(room, io);
    }
  }, 3000);
}

/**
 * Startet die Kategorie-Auswahl für den RPS Duel Gewinner
 */
export function startRPSDuelPick(room: GameRoom, io: SocketServer): void {
  room.state.timerEnd = Date.now() + 15000;
  io.to(room.code).emit('rps_duel_pick');
  broadcastRoomUpdate(room, io);

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

/**
 * Finalisiert die RPS Duel Kategorie-Auswahl
 */
export async function finalizeRPSDuelPick(room: GameRoom, io: SocketServer, categoryId: string): Promise<void> {
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
    const { startQuestion } = require('./questions');
    startQuestion(room, io);
  }, 2500);
}

/**
 * Verarbeitet eine RPS Wahl
 */
export function handleRPSChoice(room: GameRoom, io: SocketServer, playerId: string, choice: RPSChoice): void {
  const duel = room.state.rpsDuel;
  if (!duel || duel.phase !== 'choosing') return;

  // Check if this player is in the duel
  const isPlayer1 = playerId === duel.player1Id;
  const isPlayer2 = playerId === duel.player2Id;
  if (!isPlayer1 && !isPlayer2) return;

  // Check if already chose this round
  const currentIndex = duel.currentRound - 1;
  if (isPlayer1 && duel.player1Choices[currentIndex]) return;
  if (isPlayer2 && duel.player2Choices[currentIndex]) return;

  // Register choice
  if (isPlayer1) {
    duel.player1Choices.push(choice);
  } else {
    duel.player2Choices.push(choice);
  }

  const player = room.players.get(playerId);
  console.log(`✊✌️✋ ${player?.name} chose: ${choice}`);

  io.to(room.code).emit('rps_choice_made', { playerId: playerId });

  // Check if both have chosen
  if (duel.player1Choices.length === duel.currentRound && duel.player2Choices.length === duel.currentRound) {
    resolveRPSRound(room, io);
  }
}

