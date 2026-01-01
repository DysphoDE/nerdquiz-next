/**
 * Bot Manager - Handles AI bot players for testing
 * 
 * This module is completely separate from the main game logic.
 * Bots simulate real player behavior with random delays and choices.
 * Only active in development mode.
 */

import type { Server as SocketServer } from 'socket.io';

// ============================================
// TYPES
// ============================================

interface BotPlayer {
  id: string;
  roomCode: string;
  name: string;
}

interface GameRoom {
  code: string;
  players: Map<string, any>;
  state: {
    phase: string;
    diceRoyale: any;
    rpsDuel: any;
    bonusRound: any;
    loserPickPlayerId: string | null;
    votingCategories: any[];
    currentQuestion: any;
  };
}

type RoomGetter = (code: string) => GameRoom | undefined;

// ============================================
// BOT MANAGER CLASS
// ============================================

class BotManager {
  private bots: Map<string, BotPlayer> = new Map();
  private io: SocketServer | null = null;
  private getRoomFn: RoomGetter | null = null;
  private actionHandlers: Map<string, (data: any) => void> = new Map();
  private activeTimers: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Initialize the bot manager with socket server and room getter
   */
  initialize(io: SocketServer, getRoom: RoomGetter) {
    this.io = io;
    this.getRoomFn = getRoom;
    console.log('🤖 Bot Manager initialized');
  }

  /**
   * Register action handlers that bots can trigger
   */
  registerActionHandler(action: string, handler: (data: any) => void) {
    this.actionHandlers.set(action, handler);
  }

  /**
   * Register a new bot
   */
  registerBot(botId: string, roomCode: string, name: string) {
    this.bots.set(botId, { id: botId, roomCode, name });
    console.log(`🤖 Bot registered: ${name} (${botId}) in room ${roomCode}`);
  }

  /**
   * Remove a bot
   */
  removeBot(botId: string) {
    const bot = this.bots.get(botId);
    if (bot) {
      console.log(`🤖 Bot removed: ${bot.name}`);
      this.bots.delete(botId);
      // Clear any pending timers for this bot
      this.clearBotTimers(botId);
    }
  }

  /**
   * Clear all timers for a specific bot
   */
  private clearBotTimers(botId: string) {
    for (const [key, timer] of this.activeTimers) {
      if (key.startsWith(botId)) {
        clearTimeout(timer);
        this.activeTimers.delete(key);
      }
    }
  }

  /**
   * Get all bots in a room
   */
  getBotsInRoom(roomCode: string): BotPlayer[] {
    return Array.from(this.bots.values()).filter(b => b.roomCode === roomCode);
  }

  /**
   * Trigger bot actions based on game phase change
   */
  onPhaseChange(roomCode: string, phase: string) {
    const botsInRoom = this.getBotsInRoom(roomCode);
    if (botsInRoom.length === 0) return;

    const room = this.getRoomFn?.(roomCode);
    if (!room) return;

    console.log(`🤖 Phase change in ${roomCode}: ${phase} (${botsInRoom.length} bots)`);

    switch (phase) {
      case 'category_voting':
        this.handleVotingPhase(botsInRoom, room);
        break;
      case 'category_dice_royale':
        this.handleDiceRoyalePhase(botsInRoom, room);
        break;
      case 'category_rps_duel':
        this.handleRPSDuelPhase(botsInRoom, room);
        break;
      case 'category_losers_pick':
        this.handleLoserPickPhase(botsInRoom, room);
        break;
      case 'question':
        this.handleQuestionPhase(botsInRoom, room);
        break;
      case 'estimation':
        this.handleEstimationPhase(botsInRoom, room);
        break;
      case 'bonus_round':
        // Bonus round turn handling is triggered separately
        break;
    }
  }

  /**
   * Handle bonus round turn - bot submits answer when it's their turn
   * Called externally when a bot's turn starts
   */
  onBonusRoundTurn(roomCode: string, playerId: string) {
    const bot = this.bots.get(playerId);
    if (!bot) return; // Not a bot

    const room = this.getRoomFn?.(roomCode);
    if (!room || room.state.phase !== 'bonus_round') return;

    const bonusRound = room.state.bonusRound;
    if (!bonusRound || bonusRound.phase !== 'playing') return;

    // Find items that haven't been guessed yet
    const unguessedItems = bonusRound.items.filter((item: any) => !item.guessedBy);
    if (unguessedItems.length === 0) return;

    // Bot decides: 80% chance to try an answer, 20% chance to skip (get eliminated)
    const shouldTry = Math.random() < 0.8;
    
    if (!shouldTry) {
      // Bot decides to skip
      const delay = this.randomDelay(2000, 6000);
      const timerId = `${bot.id}-bonus-skip`;
      
      const timer = setTimeout(() => {
        console.log(`🤖 ${bot.name} gives up (bonus round)`);
        
        this.triggerAction('bonus_round_skip', {
          roomCode: bot.roomCode,
          playerId: bot.id,
        });
        
        this.activeTimers.delete(timerId);
      }, delay);
      
      this.activeTimers.set(timerId, timer);
      return;
    }

    // Pick a random unguessed item and submit an alias
    const delay = this.randomDelay(1500, 8000);
    const timerId = `${bot.id}-bonus-answer`;
    
    const timer = setTimeout(() => {
      // Re-check unguessed items (they may have changed)
      const currentUnguessed = bonusRound.items.filter((item: any) => !item.guessedBy);
      if (currentUnguessed.length === 0) return;
      
      const randomItem = currentUnguessed[Math.floor(Math.random() * currentUnguessed.length)];
      // Pick a random alias for more realistic variety
      const aliases = randomItem.aliases || [randomItem.display];
      const answer = aliases[Math.floor(Math.random() * aliases.length)];
      
      console.log(`🤖 ${bot.name} answers: "${answer}" (bonus round)`);
      
      this.triggerAction('bonus_round_submit', {
        roomCode: bot.roomCode,
        playerId: bot.id,
        answer: answer,
      });
      
      this.activeTimers.delete(timerId);
    }, delay);
    
    this.activeTimers.set(timerId, timer);
  }

  /**
   * Handle voting phase - bots vote for random categories
   */
  private handleVotingPhase(bots: BotPlayer[], room: GameRoom) {
    const categories = room.state.votingCategories;
    if (!categories || categories.length === 0) return;

    for (const bot of bots) {
      const delay = this.randomDelay(1000, 4000);
      const timerId = `${bot.id}-vote`;
      
      const timer = setTimeout(() => {
        const randomCategory = categories[Math.floor(Math.random() * categories.length)];
        console.log(`🤖 ${bot.name} votes for ${randomCategory.name}`);
        
        this.triggerAction('vote_category', {
          roomCode: bot.roomCode,
          playerId: bot.id,
          categoryId: randomCategory.id,
        });
        
        this.activeTimers.delete(timerId);
      }, delay);
      
      this.activeTimers.set(timerId, timer);
    }
  }

  /**
   * Handle Dice Royale phase - all bots roll dice
   */
  private handleDiceRoyalePhase(bots: BotPlayer[], room: GameRoom) {
    // Wait for the royale to be ready (rolling phase)
    const checkAndRoll = () => {
      const royale = room.state.diceRoyale;
      if (!royale || royale.phase !== 'rolling') return;

      for (const bot of bots) {
        const hasRolled = royale.playerRolls?.get?.(bot.id) !== null && royale.playerRolls?.get?.(bot.id) !== undefined;
        // Check if in tie-breaker and bot is eligible
        const isEligible = !royale.tiedPlayerIds || royale.tiedPlayerIds.includes(bot.id);

        if (!hasRolled && isEligible) {
          const delay = this.randomDelay(500, 3000);
          const timerId = `${bot.id}-dice-royale`;
          
          const timer = setTimeout(() => {
            console.log(`🤖 ${bot.name} rolls the dice (Dice Royale)!`);
            
            this.triggerAction('dice_royale_roll', {
              roomCode: bot.roomCode,
              playerId: bot.id,
            });
            
            this.activeTimers.delete(timerId);
          }, delay);
          
          this.activeTimers.set(timerId, timer);
        }
      }
    };

    // Check after a delay (wait for rolling phase)
    setTimeout(checkAndRoll, 1000);
  }

  /**
   * Handle RPS Duel phase - bots choose rock/paper/scissors
   */
  private handleRPSDuelPhase(bots: BotPlayer[], room: GameRoom) {
    // Wait for the choosing phase
    const checkAndChoose = () => {
      const duel = room.state.rpsDuel;
      if (!duel || duel.phase !== 'choosing') return;

      for (const bot of bots) {
        const isInDuel = bot.id === duel.player1Id || bot.id === duel.player2Id;
        if (!isInDuel) continue;

        const isPlayer1 = bot.id === duel.player1Id;
        const currentIndex = duel.currentRound - 1;
        const hasChosen = isPlayer1 
          ? duel.player1Choices?.[currentIndex] 
          : duel.player2Choices?.[currentIndex];

        if (!hasChosen) {
          // Bots choose immediately (100-400ms) to not slow down the game
          const delay = this.randomDelay(100, 400);
          const timerId = `${bot.id}-rps-${duel.currentRound}`;
          
          const timer = setTimeout(() => {
            const choices = ['rock', 'paper', 'scissors'];
            const choice = choices[Math.floor(Math.random() * 3)];
            console.log(`🤖 ${bot.name} chooses ${choice} (RPS Duel)!`);
            
            this.triggerAction('rps_choice', {
              roomCode: bot.roomCode,
              playerId: bot.id,
              choice,
            });
            
            this.activeTimers.delete(timerId);
          }, delay);
          
          this.activeTimers.set(timerId, timer);
        }
      }
    };

    // Check after a delay (wait for choosing phase)
    setTimeout(checkAndChoose, 500);
  }

  /**
   * Handle loser pick phase - bot picks category if they're the loser
   */
  private handleLoserPickPhase(bots: BotPlayer[], room: GameRoom) {
    const loserId = room.state.loserPickPlayerId;
    const categories = room.state.votingCategories;
    
    for (const bot of bots) {
      if (bot.id === loserId && categories.length > 0) {
        const delay = this.randomDelay(1500, 4000);
        const timerId = `${bot.id}-loserpick`;
        
        const timer = setTimeout(() => {
          const randomCategory = categories[Math.floor(Math.random() * categories.length)];
          console.log(`🤖 ${bot.name} (loser) picks ${randomCategory.name}`);
          
          this.triggerAction('loser_pick_category', {
            roomCode: bot.roomCode,
            playerId: bot.id,
            categoryId: randomCategory.id,
          });
          
          this.activeTimers.delete(timerId);
        }, delay);
        
        this.activeTimers.set(timerId, timer);
      }
    }
  }

  /**
   * Handle question phase - bots answer with random choice
   */
  private handleQuestionPhase(bots: BotPlayer[], room: GameRoom) {
    const question = room.state.currentQuestion;
    if (!question || !question.answers) return;

    for (const bot of bots) {
      const delay = this.randomDelay(1500, 8000);
      const timerId = `${bot.id}-answer`;
      
      const timer = setTimeout(() => {
        // 60% chance to get it right (if we knew the answer), otherwise random
        // Since we don't know the correct answer here, just pick random
        const randomAnswer = Math.floor(Math.random() * question.answers.length);
        console.log(`🤖 ${bot.name} answers: ${randomAnswer}`);
        
        this.triggerAction('submit_answer', {
          roomCode: bot.roomCode,
          playerId: bot.id,
          answerIndex: randomAnswer,
        });
        
        this.activeTimers.delete(timerId);
      }, delay);
      
      this.activeTimers.set(timerId, timer);
    }
  }

  /**
   * Handle estimation phase - bots submit random estimation
   */
  private handleEstimationPhase(bots: BotPlayer[], room: GameRoom) {
    const question = room.state.currentQuestion;
    if (!question || question.correctValue === undefined) return;

    for (const bot of bots) {
      const delay = this.randomDelay(2000, 10000);
      const timerId = `${bot.id}-estimation`;
      
      const timer = setTimeout(() => {
        // Generate estimation within ±50% of correct value
        const correctValue = question.correctValue;
        const variance = correctValue * (0.5 * (Math.random() * 2 - 1)); // ±50%
        const estimation = Math.round(correctValue + variance);
        
        console.log(`🤖 ${bot.name} estimates: ${estimation} (correct: ${correctValue})`);
        
        this.triggerAction('submit_estimation', {
          roomCode: bot.roomCode,
          playerId: bot.id,
          value: Math.max(0, estimation), // Don't go negative
        });
        
        this.activeTimers.delete(timerId);
      }, delay);
      
      this.activeTimers.set(timerId, timer);
    }
  }

  /**
   * Handle Dice Royale winner pick - bot picks category if they won
   */
  onDiceRoyaleWinner(roomCode: string, winnerId: string) {
    const bot = this.bots.get(winnerId);
    if (!bot) return;

    const room = this.getRoomFn?.(roomCode);
    if (!room) return;

    const categories = room.state.votingCategories;
    if (!categories || categories.length === 0) return;

    const delay = this.randomDelay(1500, 4000);
    const timerId = `${bot.id}-dice-royale-pick`;
    
    const timer = setTimeout(() => {
      const randomCategory = categories[Math.floor(Math.random() * categories.length)];
      console.log(`🤖 ${bot.name} (Dice Royale winner) picks ${randomCategory.name}`);
      
      this.triggerAction('dice_royale_pick', {
        roomCode: bot.roomCode,
        playerId: bot.id,
        categoryId: randomCategory.id,
      });
      
      this.activeTimers.delete(timerId);
    }, delay);
    
    this.activeTimers.set(timerId, timer);
  }

  /**
   * Handle RPS Duel winner pick - bot picks category if they won
   */
  onRPSDuelWinner(roomCode: string, winnerId: string) {
    const bot = this.bots.get(winnerId);
    if (!bot) return;

    const room = this.getRoomFn?.(roomCode);
    if (!room) return;

    const categories = room.state.votingCategories;
    if (!categories || categories.length === 0) return;

    const delay = this.randomDelay(1500, 4000);
    const timerId = `${bot.id}-rps-pick`;
    
    const timer = setTimeout(() => {
      const randomCategory = categories[Math.floor(Math.random() * categories.length)];
      console.log(`🤖 ${bot.name} (RPS Duel winner) picks ${randomCategory.name}`);
      
      this.triggerAction('rps_duel_pick', {
        roomCode: bot.roomCode,
        playerId: bot.id,
        categoryId: randomCategory.id,
      });
      
      this.activeTimers.delete(timerId);
    }, delay);
    
    this.activeTimers.set(timerId, timer);
  }

  /**
   * Trigger an action (calls registered handler)
   */
  private triggerAction(action: string, data: any) {
    const handler = this.actionHandlers.get(action);
    if (handler) {
      handler(data);
    } else {
      console.warn(`🤖 No handler for action: ${action}`);
    }
  }

  /**
   * Generate random delay between min and max ms
   */
  private randomDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Check if a player ID belongs to a bot
   */
  isBot(playerId: string): boolean {
    return this.bots.has(playerId);
  }

  /**
   * Clean up all bots in a room (when room is deleted)
   */
  cleanupRoom(roomCode: string) {
    const botsInRoom = this.getBotsInRoom(roomCode);
    for (const bot of botsInRoom) {
      this.removeBot(bot.id);
    }
  }
}

// Export singleton instance
export const botManager = new BotManager();


