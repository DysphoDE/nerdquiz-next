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
   * Clear all timers for bots in a specific room
   * Should be called when phase changes to prevent stale actions
   */
  clearRoomTimers(roomCode: string): void {
    const keysToDelete: string[] = [];
    for (const [key, timer] of this.activeTimers) {
      // Check if this timer belongs to a bot in this room
      const botId = key.split('-')[0];
      const bot = this.bots.get(botId);
      if (bot && bot.roomCode === roomCode) {
        clearTimeout(timer);
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.activeTimers.delete(key));
    if (keysToDelete.length > 0) {
      console.log(`🤖 Cleared ${keysToDelete.length} bot timers for room ${roomCode}`);
    }
  }

  /**
   * Trigger bot actions based on game phase change
   */
  onPhaseChange(roomCode: string, phase: string) {
    // Clear any pending timers from previous phase to prevent stale actions
    this.clearRoomTimers(roomCode);
    
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

    const turnNumber = bonusRound.turnNumber; // Capture for validation

    // Bot decides: 80% chance to try an answer, 20% chance to skip (get eliminated)
    const shouldTry = Math.random() < 0.8;
    
    if (!shouldTry) {
      // Bot decides to skip
      const delay = this.randomDelay(2000, 6000);
      const timerId = `${bot.id}-bonus-skip`;
      
      const timer = setTimeout(() => {
        this.activeTimers.delete(timerId);
        
        // Re-validate state before action
        const currentRoom = this.getRoomFn?.(roomCode);
        if (!currentRoom || currentRoom.state.phase !== 'bonus_round') return;
        if (!currentRoom.state.bonusRound || currentRoom.state.bonusRound.phase !== 'playing') return;
        if (currentRoom.state.bonusRound.turnNumber !== turnNumber) return; // Turn already passed
        
        console.log(`🤖 ${bot.name} gives up (bonus round)`);
        
        this.triggerAction('bonus_round_skip', {
          roomCode: bot.roomCode,
          playerId: bot.id,
        });
      }, delay);
      
      this.activeTimers.set(timerId, timer);
      return;
    }

    // Pick a random unguessed item and submit an alias
    const delay = this.randomDelay(1500, 8000);
    const timerId = `${bot.id}-bonus-answer`;
    
    const timer = setTimeout(() => {
      this.activeTimers.delete(timerId);
      
      // Re-validate state before action
      const currentRoom = this.getRoomFn?.(roomCode);
      if (!currentRoom || currentRoom.state.phase !== 'bonus_round') return;
      if (!currentRoom.state.bonusRound || currentRoom.state.bonusRound.phase !== 'playing') return;
      if (currentRoom.state.bonusRound.turnNumber !== turnNumber) return; // Turn already passed
      
      // Re-check unguessed items (they may have changed)
      const currentUnguessed = currentRoom.state.bonusRound.items.filter((item: any) => !item.guessedBy);
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
    }, delay);
    
    this.activeTimers.set(timerId, timer);
  }

  /**
   * Handle voting phase - bots vote for random categories
   */
  private handleVotingPhase(bots: BotPlayer[], room: GameRoom) {
    const categories = room.state.votingCategories;
    if (!categories || categories.length === 0) return;
    const roomCode = room.code;

    for (const bot of bots) {
      const delay = this.randomDelay(1000, 4000);
      const timerId = `${bot.id}-vote`;
      
      const timer = setTimeout(() => {
        this.activeTimers.delete(timerId);
        
        // Re-fetch room to validate state
        const currentRoom = this.getRoomFn?.(roomCode);
        if (!currentRoom || currentRoom.state.phase !== 'category_voting') return;
        
        const currentCategories = currentRoom.state.votingCategories;
        if (!currentCategories || currentCategories.length === 0) return;
        
        const randomCategory = currentCategories[Math.floor(Math.random() * currentCategories.length)];
        console.log(`🤖 ${bot.name} votes for ${randomCategory.name}`);
        
        this.triggerAction('vote_category', {
          roomCode: bot.roomCode,
          playerId: bot.id,
          categoryId: randomCategory.id,
        });
      }, delay);
      
      this.activeTimers.set(timerId, timer);
    }
  }

  /**
   * Handle Dice Royale phase - all bots roll dice
   */
  private handleDiceRoyalePhase(bots: BotPlayer[], room: GameRoom) {
    const roomCode = room.code;
    
    // Wait for the royale to be ready (rolling phase)
    const checkAndRoll = () => {
      // Re-fetch room to validate state
      const currentRoom = this.getRoomFn?.(roomCode);
      if (!currentRoom || currentRoom.state.phase !== 'category_dice_royale') return;
      
      const royale = currentRoom.state.diceRoyale;
      if (!royale || royale.phase !== 'rolling') return;

      for (const bot of bots) {
        const hasRolled = royale.playerRolls?.get?.(bot.id) !== null && royale.playerRolls?.get?.(bot.id) !== undefined;
        // Check if in tie-breaker and bot is eligible
        const isEligible = !royale.tiedPlayerIds || royale.tiedPlayerIds.includes(bot.id);

        if (!hasRolled && isEligible) {
          const delay = this.randomDelay(500, 3000);
          const timerId = `${bot.id}-dice-royale`;
          
          const timer = setTimeout(() => {
            this.activeTimers.delete(timerId);
            
            // Re-validate state before action
            const innerRoom = this.getRoomFn?.(roomCode);
            if (!innerRoom || innerRoom.state.phase !== 'category_dice_royale') return;
            if (!innerRoom.state.diceRoyale || innerRoom.state.diceRoyale.phase !== 'rolling') return;
            
            console.log(`🤖 ${bot.name} rolls the dice (Dice Royale)!`);
            
            this.triggerAction('dice_royale_roll', {
              roomCode: bot.roomCode,
              playerId: bot.id,
            });
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
    const roomCode = room.code;
    
    // Wait for the choosing phase
    const checkAndChoose = () => {
      // Re-fetch room to validate state
      const currentRoom = this.getRoomFn?.(roomCode);
      if (!currentRoom || currentRoom.state.phase !== 'category_rps_duel') return;
      
      const duel = currentRoom.state.rpsDuel;
      if (!duel || duel.phase !== 'choosing') return;

      for (const bot of bots) {
        const isInDuel = bot.id === duel.player1Id || bot.id === duel.player2Id;
        if (!isInDuel) continue;

        const isPlayer1 = bot.id === duel.player1Id;
        const currentIndex = duel.currentRound - 1;
        const hasChosen = isPlayer1 
          ? duel.player1Choices?.[currentIndex] 
          : duel.player2Choices?.[currentIndex];
        const capturedRound = duel.currentRound;

        if (!hasChosen) {
          // Bots choose immediately (100-400ms) to not slow down the game
          const delay = this.randomDelay(100, 400);
          const timerId = `${bot.id}-rps-${capturedRound}`;
          
          const timer = setTimeout(() => {
            this.activeTimers.delete(timerId);
            
            // Re-validate state before action
            const innerRoom = this.getRoomFn?.(roomCode);
            if (!innerRoom || innerRoom.state.phase !== 'category_rps_duel') return;
            if (!innerRoom.state.rpsDuel || innerRoom.state.rpsDuel.phase !== 'choosing') return;
            if (innerRoom.state.rpsDuel.currentRound !== capturedRound) return;
            
            const choices = ['rock', 'paper', 'scissors'];
            const choice = choices[Math.floor(Math.random() * 3)];
            console.log(`🤖 ${bot.name} chooses ${choice} (RPS Duel)!`);
            
            this.triggerAction('rps_choice', {
              roomCode: bot.roomCode,
              playerId: bot.id,
              choice,
            });
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
    const roomCode = room.code;
    
    for (const bot of bots) {
      if (bot.id === loserId && categories.length > 0) {
        const delay = this.randomDelay(1500, 4000);
        const timerId = `${bot.id}-loserpick`;
        
        const timer = setTimeout(() => {
          this.activeTimers.delete(timerId);
          
          // Re-fetch room to validate state
          const currentRoom = this.getRoomFn?.(roomCode);
          if (!currentRoom || currentRoom.state.phase !== 'category_losers_pick') return;
          
          const currentCategories = currentRoom.state.votingCategories;
          if (!currentCategories || currentCategories.length === 0) return;
          
          const randomCategory = currentCategories[Math.floor(Math.random() * currentCategories.length)];
          console.log(`🤖 ${bot.name} (loser) picks ${randomCategory.name}`);
          
          this.triggerAction('loser_pick_category', {
            roomCode: bot.roomCode,
            playerId: bot.id,
            categoryId: randomCategory.id,
          });
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
    const roomCode = room.code;
    const questionAnswerCount = question.answers.length;

    for (const bot of bots) {
      const delay = this.randomDelay(1500, 8000);
      const timerId = `${bot.id}-answer`;
      
      const timer = setTimeout(() => {
        this.activeTimers.delete(timerId);
        
        // Re-fetch room to validate state
        const currentRoom = this.getRoomFn?.(roomCode);
        if (!currentRoom || currentRoom.state.phase !== 'question') return;
        
        // 60% chance to get it right (if we knew the answer), otherwise random
        // Since we don't know the correct answer here, just pick random
        const randomAnswer = Math.floor(Math.random() * questionAnswerCount);
        console.log(`🤖 ${bot.name} answers: ${randomAnswer}`);
        
        this.triggerAction('submit_answer', {
          roomCode: bot.roomCode,
          playerId: bot.id,
          answerIndex: randomAnswer,
        });
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
    const roomCode = room.code;
    const correctValue = question.correctValue;

    for (const bot of bots) {
      const delay = this.randomDelay(2000, 10000);
      const timerId = `${bot.id}-estimation`;
      
      const timer = setTimeout(() => {
        this.activeTimers.delete(timerId);
        
        // Re-fetch room to validate state
        const currentRoom = this.getRoomFn?.(roomCode);
        if (!currentRoom || currentRoom.state.phase !== 'estimation') return;
        
        // Generate estimation within ±50% of correct value
        const variance = correctValue * (0.5 * (Math.random() * 2 - 1)); // ±50%
        const estimation = Math.round(correctValue + variance);
        
        console.log(`🤖 ${bot.name} estimates: ${estimation} (correct: ${correctValue})`);
        
        this.triggerAction('submit_estimation', {
          roomCode: bot.roomCode,
          playerId: bot.id,
          value: Math.max(0, estimation), // Don't go negative
        });
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
      this.activeTimers.delete(timerId);
      
      // Re-validate state before action
      const currentRoom = this.getRoomFn?.(roomCode);
      if (!currentRoom || currentRoom.state.phase !== 'category_dice_royale') return;
      if (!currentRoom.state.diceRoyale || currentRoom.state.diceRoyale.phase !== 'result') return;
      
      const currentCategories = currentRoom.state.votingCategories;
      if (!currentCategories || currentCategories.length === 0) return;
      
      const randomCategory = currentCategories[Math.floor(Math.random() * currentCategories.length)];
      console.log(`🤖 ${bot.name} (Dice Royale winner) picks ${randomCategory.name}`);
      
      this.triggerAction('dice_royale_pick', {
        roomCode: bot.roomCode,
        playerId: bot.id,
        categoryId: randomCategory.id,
      });
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
      this.activeTimers.delete(timerId);
      
      // Re-validate state before action
      const currentRoom = this.getRoomFn?.(roomCode);
      if (!currentRoom || currentRoom.state.phase !== 'category_rps_duel') return;
      if (!currentRoom.state.rpsDuel || currentRoom.state.rpsDuel.phase !== 'result') return;
      
      const currentCategories = currentRoom.state.votingCategories;
      if (!currentCategories || currentCategories.length === 0) return;
      
      const randomCategory = currentCategories[Math.floor(Math.random() * currentCategories.length)];
      console.log(`🤖 ${bot.name} (RPS Duel winner) picks ${randomCategory.name}`);
      
      this.triggerAction('rps_duel_pick', {
        roomCode: bot.roomCode,
        playerId: bot.id,
        categoryId: randomCategory.id,
      });
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
   * Called when a new Hot Button question starts (all players can buzz)
   */
  onHotButtonQuestionStart(roomCode: string) {
    const botsInRoom = this.getBotsInRoom(roomCode);
    if (botsInRoom.length === 0) return;

    const room = this.getRoomFn?.(roomCode);
    if (!room || room.state.phase !== 'bonus_round') return;
    
    const bonusRound = room.state.bonusRound;
    if (!bonusRound || bonusRound.type !== 'hot_button') return;

    // Each bot decides independently when to buzz
    botsInRoom.forEach(bot => {
      // Skip if bot has already attempted this question
      if (bonusRound.attemptedPlayerIds.has(bot.id)) return;
      
      // Bot decides: 60% chance to try buzzing, 40% wait/skip
      const shouldBuzz = Math.random() < 0.6;
      if (!shouldBuzz) return;
      
      // Random delay (1-8 seconds) - some bots are faster than others
      const buzzDelay = this.randomDelay(1000, 8000);
      const timerId = `${bot.id}-hotbutton-buzz`;
      
      const timer = setTimeout(() => {
        this.activeTimers.delete(timerId);
        
        // Re-validate state before buzzing
        const currentRoom = this.getRoomFn?.(roomCode);
        if (!currentRoom || currentRoom.state.phase !== 'bonus_round') return;
        if (!currentRoom.state.bonusRound || currentRoom.state.bonusRound.type !== 'hot_button') return;
        if (currentRoom.state.bonusRound.phase !== 'question_reveal') return;
        if (currentRoom.state.bonusRound.attemptedPlayerIds.has(bot.id)) return;
        
        console.log(`🤖 ${bot.name} buzzing!`);
        this.triggerAction('hot_button_buzz', {
          roomCode: bot.roomCode,
          playerId: bot.id,
        });
        
        // After buzzing, bot needs to answer
        const answerDelay = this.randomDelay(2000, 5000);
        const answerTimerId = `${bot.id}-hotbutton-answer`;
        
        const answerTimer = setTimeout(() => {
          this.activeTimers.delete(answerTimerId);
          
          // Re-validate state before answering
          const answerRoom = this.getRoomFn?.(roomCode);
          if (!answerRoom || answerRoom.state.phase !== 'bonus_round') return;
          if (!answerRoom.state.bonusRound || answerRoom.state.bonusRound.type !== 'hot_button') return;
          if (answerRoom.state.bonusRound.phase !== 'answering') return;
          if (answerRoom.state.bonusRound.buzzedPlayerId !== bot.id) return;
          
          const currentQuestion = answerRoom.state.bonusRound.questions[answerRoom.state.bonusRound.currentQuestionIndex];
          
          // Bot has 70% chance to answer correctly
          const answerCorrectly = Math.random() < 0.7;
          const answer = answerCorrectly 
            ? currentQuestion.correctAnswer 
            : `Wrong answer ${Math.random().toString(36).substring(7)}`;
          
          console.log(`🤖 ${bot.name} answering: "${answer}" (${answerCorrectly ? 'correct' : 'wrong'})`);
          this.triggerAction('hot_button_submit', {
            roomCode: bot.roomCode,
            playerId: bot.id,
            answer,
          });
        }, answerDelay);
        
        this.activeTimers.set(answerTimerId, answerTimer);
      }, buzzDelay);
      
      this.activeTimers.set(timerId, timer);
    });
  }

  /**
   * Called when a Hot Button question allows rebuzzing (after wrong answer)
   */
  onHotButtonRebuzz(roomCode: string) {
    const botsInRoom = this.getBotsInRoom(roomCode);
    if (botsInRoom.length === 0) return;

    const room = this.getRoomFn?.(roomCode);
    if (!room || room.state.phase !== 'bonus_round') return;
    
    const bonusRound = room.state.bonusRound;
    if (!bonusRound || bonusRound.type !== 'hot_button') return;

    botsInRoom.forEach(bot => {
      // Skip if bot has already attempted this question
      if (bonusRound.attemptedPlayerIds.has(bot.id)) return;
      
      // Bot is more cautious after seeing a wrong answer: 50% chance
      const shouldBuzz = Math.random() < 0.5;
      if (!shouldBuzz) return;
      
      // Slightly longer delay on rebuzz (thinking time)
      const buzzDelay = this.randomDelay(2000, 10000);
      const timerId = `${bot.id}-hotbutton-rebuzz`;
      
      const timer = setTimeout(() => {
        this.activeTimers.delete(timerId);
        
        const currentRoom = this.getRoomFn?.(roomCode);
        if (!currentRoom || currentRoom.state.phase !== 'bonus_round') return;
        if (!currentRoom.state.bonusRound || currentRoom.state.bonusRound.type !== 'hot_button') return;
        if (currentRoom.state.bonusRound.phase !== 'question_reveal') return;
        if (currentRoom.state.bonusRound.attemptedPlayerIds.has(bot.id)) return;
        
        console.log(`🤖 ${bot.name} rebuzzing!`);
        this.triggerAction('hot_button_buzz', {
          roomCode: bot.roomCode,
          playerId: bot.id,
        });
        
        // Answer handling
        const answerDelay = this.randomDelay(2000, 5000);
        const answerTimerId = `${bot.id}-hotbutton-rebuzz-answer`;
        
        const answerTimer = setTimeout(() => {
          this.activeTimers.delete(answerTimerId);
          
          const answerRoom = this.getRoomFn?.(roomCode);
          if (!answerRoom || answerRoom.state.phase !== 'bonus_round') return;
          if (!answerRoom.state.bonusRound || answerRoom.state.bonusRound.type !== 'hot_button') return;
          if (answerRoom.state.bonusRound.phase !== 'answering') return;
          if (answerRoom.state.bonusRound.buzzedPlayerId !== bot.id) return;
          
          const currentQuestion = answerRoom.state.bonusRound.questions[answerRoom.state.bonusRound.currentQuestionIndex];
          
          // Bot has 75% chance to answer correctly on rebuzz
          const answerCorrectly = Math.random() < 0.75;
          const answer = answerCorrectly 
            ? currentQuestion.correctAnswer 
            : `Wrong answer ${Math.random().toString(36).substring(7)}`;
          
          console.log(`🤖 ${bot.name} rebuzz answer: "${answer}" (${answerCorrectly ? 'correct' : 'wrong'})`);
          this.triggerAction('hot_button_submit', {
            roomCode: bot.roomCode,
            playerId: bot.id,
            answer,
          });
        }, answerDelay);
        
        this.activeTimers.set(answerTimerId, answerTimer);
      }, buzzDelay);
      
      this.activeTimers.set(timerId, timer);
    });
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


