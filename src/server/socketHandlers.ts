/**
 * Socket Handlers
 * 
 * Registriert alle Socket.io Event-Handler.
 * Diese Datei verbindet die Game Logic mit den Socket Events.
 */

import type { Server as SocketServer, Socket } from 'socket.io';
import type { GameRoom, Player, GameSettings, RPSChoice } from './types';
import { DEFAULT_GAME_SETTINGS, createInitialGameState } from './types';
import { 
  getRoom, 
  setRoom, 
  generateRoomCode, 
  generatePlayerId,
  roomToClient,
  broadcastRoomUpdate,
  cleanupRoom,
  scheduleRoomCleanupIfEmpty,
  getConnectedPlayers,
  rollDie,
} from './roomStore';
import { botManager } from './botManager';
import * as questionLoader from './questionLoader';

// Game Logic Imports
import {
  finalizeCategoryVoting,
  finalizeLosersPick,
  finalizeDiceRoyalePick,
  finalizeRPSDuelPick,
  handleDiceRoyaleRoll,
  handleRPSChoice,
  checkDiceRoyaleResult,
  resolveRPSRound,
  getQuestionsForRoom,
} from './gameLogic/categorySelection';
import {
  handleAnswer,
  handleEstimation,
  showAnswer,
  showEstimationAnswer,
  proceedAfterReveal,
  startQuestion,
} from './gameLogic/questions';
import {
  handleBonusRoundAnswer,
  handleBonusRoundSkip,
  startBonusRound,
} from './gameLogic/bonusRound';
import {
  startCategorySelection,
  showScoreboard,
  showFinalResults,
  handleRematchVote,
} from './gameLogic/matchFlow';

const dev = process.env.NODE_ENV !== 'production';

// ============================================
// MAIN SOCKET HANDLER SETUP
// ============================================

/**
 * Registriert alle Socket-Event-Handler
 */
export function setupSocketHandlers(io: SocketServer): void {
  io.on('connection', (socket) => {
    console.log(`🔌 Connected: ${socket.id}`);

    // === CREATE ROOM ===
    socket.on('create_room', handleCreateRoom(socket));

    // === JOIN ROOM ===
    socket.on('join_room', handleJoinRoom(socket, io));

    // === UPDATE SETTINGS ===
    socket.on('update_settings', handleUpdateSettings(io));

    // === REROLL AVATAR ===
    socket.on('reroll_avatar', handleRerollAvatar(io));

    // === START GAME ===
    socket.on('start_game', handleStartGame(io));

    // === VOTE CATEGORY ===
    socket.on('vote_category', handleVoteCategory(io));

    // === LOSER PICK CATEGORY ===
    socket.on('loser_pick_category', handleLoserPickCategory(io));

    // === DICE ROYALE ===
    socket.on('dice_royale_roll', handleDiceRoyaleRollEvent(io));
    socket.on('dice_royale_pick', handleDiceRoyalePickEvent(io));

    // === RPS DUEL ===
    socket.on('rps_choice', handleRPSChoiceEvent(io));
    socket.on('rps_duel_pick', handleRPSDuelPickEvent(io));

    // === SUBMIT ANSWER ===
    socket.on('submit_answer', handleSubmitAnswer(io));
    socket.on('submit_estimation', handleSubmitEstimation(io));

    // === BONUS ROUND ===
    socket.on('bonus_round_submit', handleBonusRoundSubmit(io));
    socket.on('bonus_round_skip', handleBonusRoundSkipEvent(io));

    // === REMATCH ===
    socket.on('vote_rematch', handleVoteRematch(socket, io));

    // === NEXT ===
    socket.on('next', handleNext(io));

    // === DEV COMMANDS ===
    socket.on('dev_command', handleDevCommand(io));
    socket.on('enable_dev_mode', handleEnableDevMode(io));

    // === RECONNECT ===
    socket.on('reconnect_player', handleReconnect(socket, io));

    // === DISCONNECT ===
    socket.on('disconnect', handleDisconnect(socket, io));
  });

  // === BOT MANAGER SETUP ===
  if (dev) {
    setupBotHandlers(io);
  }
}

// ============================================
// HANDLER FACTORIES
// ============================================

function handleCreateRoom(socket: Socket) {
  return (data: { playerName: string }, callback: (response: any) => void) => {
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
      settings: { ...DEFAULT_GAME_SETTINGS },
      state: createInitialGameState(),
      createdAt: new Date(),
    };

    setRoom(roomCode, room);
    socket.join(roomCode);
    
    console.log(`🎮 Room ${roomCode} created by ${data.playerName}`);
    
    callback({
      success: true,
      roomCode,
      playerId,
      room: roomToClient(room),
    });
  };
}

function handleJoinRoom(socket: Socket, io: SocketServer) {
  return (data: { roomCode: string; playerName: string }, callback: (response: any) => void) => {
    const code = data.roomCode.toUpperCase();
    const room = getRoom(code);
    
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

    broadcastRoomUpdate(room, io);
    io.to(code).emit('player_joined', { playerName: data.playerName, playerId });

    callback({
      success: true,
      roomCode: code,
      playerId,
      room: roomToClient(room),
    });
  };
}

function handleUpdateSettings(io: SocketServer) {
  return (data: { roomCode: string; playerId: string; settings: Partial<GameSettings> }) => {
    const room = getRoom(data.roomCode);
    if (!room) return;
    
    const player = room.players.get(data.playerId);
    if (!player?.isHost) return;
    
    room.settings = { ...room.settings, ...data.settings };
    broadcastRoomUpdate(room, io);
  };
}

function handleRerollAvatar(io: SocketServer) {
  return (data: { roomCode: string; playerId: string }) => {
    const room = getRoom(data.roomCode);
    if (!room || room.state.phase !== 'lobby') return;
    
    const player = room.players.get(data.playerId);
    if (!player) return;
    
    player.avatarSeed = player.name + Date.now() + Math.random().toString(36).slice(2);
    console.log(`🎲 ${player.name} rerolled avatar`);
    broadcastRoomUpdate(room, io);
  };
}

function handleStartGame(io: SocketServer) {
  return (data: { roomCode: string; playerId: string }, callback: (response: any) => void) => {
    const room = getRoom(data.roomCode);
    
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
  };
}

function handleVoteCategory(io: SocketServer) {
  return (data: { roomCode: string; playerId: string; categoryId: string }) => {
    const room = getRoom(data.roomCode);
    if (!room || room.state.phase !== 'category_voting') return;

    room.state.categoryVotes.set(data.playerId, data.categoryId);
    broadcastRoomUpdate(room, io);

    if (room.state.categoryVotes.size >= room.players.size) {
      finalizeCategoryVoting(room, io);
    }
  };
}

function handleLoserPickCategory(io: SocketServer) {
  return (data: { roomCode: string; playerId: string; categoryId: string }) => {
    const room = getRoom(data.roomCode);
    if (!room || room.state.phase !== 'category_losers_pick') return;
    if (data.playerId !== room.state.loserPickPlayerId) return;

    finalizeLosersPick(room, io, data.categoryId);
  };
}

function handleDiceRoyaleRollEvent(io: SocketServer) {
  return (data: { roomCode: string; playerId: string }) => {
    const room = getRoom(data.roomCode);
    if (!room || room.state.phase !== 'category_dice_royale') return;
    
    handleDiceRoyaleRoll(room, io, data.playerId);
  };
}

function handleDiceRoyalePickEvent(io: SocketServer) {
  return (data: { roomCode: string; playerId: string; categoryId: string }) => {
    const room = getRoom(data.roomCode);
    if (!room || room.state.phase !== 'category_dice_royale') return;
    
    const royale = room.state.diceRoyale;
    if (!royale || royale.phase !== 'result') return;
    if (data.playerId !== royale.winnerId) return;

    finalizeDiceRoyalePick(room, io, data.categoryId);
  };
}

function handleRPSChoiceEvent(io: SocketServer) {
  return (data: { roomCode: string; playerId: string; choice: RPSChoice }) => {
    const room = getRoom(data.roomCode);
    if (!room || room.state.phase !== 'category_rps_duel') return;
    
    handleRPSChoice(room, io, data.playerId, data.choice);
  };
}

function handleRPSDuelPickEvent(io: SocketServer) {
  return (data: { roomCode: string; playerId: string; categoryId: string }) => {
    const room = getRoom(data.roomCode);
    if (!room || room.state.phase !== 'category_rps_duel') return;
    
    const duel = room.state.rpsDuel;
    if (!duel || duel.phase !== 'result') return;
    if (data.playerId !== duel.winnerId) return;

    finalizeRPSDuelPick(room, io, data.categoryId);
  };
}

function handleSubmitAnswer(io: SocketServer) {
  return (data: { roomCode: string; playerId: string; answerIndex: number }) => {
    const room = getRoom(data.roomCode);
    if (!room) return;
    
    handleAnswer(room, io, data.playerId, data.answerIndex);
  };
}

function handleSubmitEstimation(io: SocketServer) {
  return (data: { roomCode: string; playerId: string; value: number }) => {
    const room = getRoom(data.roomCode);
    if (!room) return;
    
    handleEstimation(room, io, data.playerId, data.value);
  };
}

function handleBonusRoundSubmit(io: SocketServer) {
  return (data: { roomCode: string; playerId: string; answer: string }) => {
    const room = getRoom(data.roomCode);
    if (!room || room.state.phase !== 'bonus_round') return;
    
    const bonusRound = room.state.bonusRound;
    if (!bonusRound || bonusRound.phase !== 'playing') return;
    
    const currentPlayerId = bonusRound.activePlayers[bonusRound.currentTurnIndex % bonusRound.activePlayers.length];
    if (data.playerId !== currentPlayerId) return;
    
    handleBonusRoundAnswer(room, io, data.playerId, data.answer);
  };
}

function handleBonusRoundSkipEvent(io: SocketServer) {
  return (data: { roomCode: string; playerId: string }) => {
    const room = getRoom(data.roomCode);
    if (!room || room.state.phase !== 'bonus_round') return;
    
    const bonusRound = room.state.bonusRound;
    if (!bonusRound || bonusRound.phase !== 'playing') return;
    
    const currentPlayerId = bonusRound.activePlayers[bonusRound.currentTurnIndex % bonusRound.activePlayers.length];
    if (data.playerId !== currentPlayerId) return;
    
    handleBonusRoundSkip(room, io, data.playerId);
  };
}

function handleVoteRematch(socket: Socket, io: SocketServer) {
  return (data: { roomCode: string; playerId: string; vote: 'yes' | 'no' }) => {
    const room = getRoom(data.roomCode);
    if (!room || room.state.phase !== 'rematch_voting') return;
    
    handleRematchVote(room, io, data.playerId, data.vote, socket);
  };
}

function handleNext(io: SocketServer) {
  return (data: { roomCode: string; playerId: string }) => {
    const room = getRoom(data.roomCode);
    if (!room) return;
    
    const player = room.players.get(data.playerId);
    if (!player?.isHost) return;

    if (room.state.phase === 'revealing' || room.state.phase === 'estimation_reveal') {
      proceedAfterReveal(room, io);
    } else if (room.state.phase === 'scoreboard') {
      startCategorySelection(room, io);
    }
  };
}

function handleEnableDevMode(io: SocketServer) {
  return (data: { roomCode: string; playerId: string; secretCode: string }) => {
    const room = getRoom(data.roomCode);
    if (!room) return;

    const player = room.players.get(data.playerId);
    if (!player?.isHost) return;

    // Check secret code
    if (data.secretCode === 'clairobscur99') {
      room.devModeEnabled = true;
      console.log(`🔓 Dev mode enabled for room ${room.code} via secret code`);
      io.to(room.code).emit('dev_mode_enabled');
    }
  };
}

function handleDevCommand(io: SocketServer) {
  return async (data: { roomCode: string; playerId: string; command: string; params?: any }) => {
    const room = getRoom(data.roomCode);
    if (!room) return;

    // Allow dev commands in development OR if dev mode is enabled via secret code
    const isDevAllowed = process.env.NODE_ENV !== 'production' || room.devModeEnabled === true;
    if (!isDevAllowed) return;

    const player = room.players.get(data.playerId);
    if (!player?.isHost) return;

    console.log(`🔧 Dev command: ${data.command}`, data.params);

    switch (data.command) {
      case 'force_category_mode': {
        room.forcedCategoryMode = data.params?.mode;
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
        botManager.registerBot(botId, data.roomCode, botName);
        
        broadcastRoomUpdate(room, io);
        io.to(room.code).emit('dev_notification', { message: `${botName} hinzugefügt` });
        break;
      }

      case 'randomize_scores': {
        room.players.forEach(p => {
          p.score = Math.floor(Math.random() * 5000);
          p.streak = Math.floor(Math.random() * 5);
        });
        broadcastRoomUpdate(room, io);
        io.to(room.code).emit('dev_notification', { message: 'Scores randomisiert' });
        break;
      }

      case 'skip_to_question': {
        if (room.state.phase === 'lobby') {
          startCategorySelection(room, io);
        }
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
        const categories = await questionLoader.getCategoryList();
        if (categories.length > 0) {
          const questions = await questionLoader.getRandomQuestions(categories[0].id, 5);
          const estQ = questions.find(q => q.type === 'estimation');
          if (estQ) {
            room.state.currentQuestion = estQ;
            room.state.phase = 'estimation';
            room.state.timerEnd = Date.now() + 30000;
            io.to(room.code).emit('phase_change', { phase: 'estimation' });
            broadcastRoomUpdate(room, io);
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
        const excludeIds = Array.from(room.state.usedBonusQuestionIds);
        const bonusQuestion = await questionLoader.getRandomBonusRoundQuestion(excludeIds);
        if (bonusQuestion) {
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

      case 'start_endless_round': {
        // Endlosrunde: Lädt immer wieder neue Fragen aus einer Kategorie
        const categorySlug = data.params?.categoryId;
        if (!categorySlug) {
          io.to(room.code).emit('dev_notification', { message: 'Keine Kategorie ausgewählt!' });
          break;
        }

        // Set high round limit for "endless" mode
        room.settings.maxRounds = 999;
        room.settings.questionsPerRound = 999;
        room.state.currentRound = 1;
        room.state.currentQuestionIndex = 0;
        
        // Clear used questions to get fresh pool
        room.state.usedQuestionIds.clear();
        
        // Load questions from selected category
        const questions = await getQuestionsForRoom(room, categorySlug, 50);
        if (questions.length === 0) {
          io.to(room.code).emit('dev_notification', { message: `Keine Fragen in Kategorie "${categorySlug}" gefunden!` });
          break;
        }

        room.state.roundQuestions = questions;
        room.state.selectedCategory = categorySlug;
        
        // Mark room as endless mode (can be used for UI)
        room.isEndlessMode = true;
        room.endlessCategoryId = categorySlug;

        // Start first question
        startQuestion(room, io);
        
        const categoryName = questions[0]?.category || categorySlug;
        io.to(room.code).emit('dev_notification', { 
          message: `♾️ Endlosrunde gestartet: ${categoryName} (${questions.length} Fragen)` 
        });
        break;
      }

      case 'pause_game': {
        // Pause the game timer
        if (room.isPaused) break;
        
        room.isPaused = true;
        room.pausedAt = Date.now();
        
        // Calculate remaining time
        if (room.state.timerEnd) {
          room.remainingTime = Math.max(0, room.state.timerEnd - Date.now());
        }
        
        // Clear any existing timer
        if (room.questionTimer) {
          clearTimeout(room.questionTimer);
          room.questionTimer = undefined;
        }
        
        // Also pause bonus round timer if active
        if (room.state.bonusRound?.currentTurnTimer) {
          clearTimeout(room.state.bonusRound.currentTurnTimer);
          room.state.bonusRound.currentTurnTimer = null;
        }
        
        io.to(room.code).emit('game_paused', { paused: true });
        io.to(room.code).emit('dev_notification', { message: '⏸️ Spiel pausiert' });
        console.log(`⏸️ Game paused in room ${room.code}`);
        break;
      }

      case 'resume_game': {
        // Resume the game timer
        if (!room.isPaused) break;
        
        room.isPaused = false;
        
        // Restore timer with remaining time
        if (room.remainingTime && room.remainingTime > 0) {
          room.state.timerEnd = Date.now() + room.remainingTime;
          
          // Re-schedule the timeout
          room.questionTimer = setTimeout(() => {
            if (room.state.phase === 'question') {
              showAnswer(room, io);
            } else if (room.state.phase === 'estimation') {
              showEstimationAnswer(room, io);
            }
          }, room.remainingTime);
        }
        
        // Resume bonus round timer if active
        if (room.state.bonusRound && room.state.phase === 'bonus_round') {
          const bonusRound = room.state.bonusRound;
          if (bonusRound.phase === 'playing' && room.remainingTime) {
            // Re-schedule bonus round turn timer
            const { handleBonusRoundTimeout } = require('./gameLogic/bonusRound');
            bonusRound.currentTurnTimer = setTimeout(() => {
              handleBonusRoundTimeout(room, io);
            }, room.remainingTime);
          }
        }
        
        room.pausedAt = undefined;
        room.remainingTime = undefined;
        
        io.to(room.code).emit('game_paused', { paused: false });
        broadcastRoomUpdate(room, io);
        io.to(room.code).emit('dev_notification', { message: '▶️ Spiel fortgesetzt' });
        console.log(`▶️ Game resumed in room ${room.code}`);
        break;
      }
    }
  };
}

function handleReconnect(socket: Socket, io: SocketServer) {
  return (data: { roomCode: string; playerId: string }, callback: (response: any) => void) => {
    const room = getRoom(data.roomCode);
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
    broadcastRoomUpdate(room, io);

    callback({ success: true, room: roomToClient(room) });
  };
}

function handleDisconnect(socket: Socket, io: SocketServer) {
  return () => {
    console.log(`🔌 Disconnected: ${socket.id}`);
    
    // Find the room and player for this socket
    let foundRoom: GameRoom | undefined;
    let foundPlayer: Player | undefined;
    let roomCode: string | undefined;
    
    // We need to iterate through all rooms
    const allRooms = new Map<string, GameRoom>();
    // Since we can't easily iterate from roomStore, we'll check each known room
    // This is a limitation - we need a different approach
    
    // Alternative: Store socket -> room mapping (would require additional tracking)
    // For now, we'll use a workaround by checking socket rooms
    const socketRooms = Array.from(socket.rooms).filter(r => r !== socket.id);
    
    for (const code of socketRooms) {
      const room = getRoom(code);
      if (room) {
        room.players.forEach((player) => {
          if (player.socketId === socket.id) {
            foundRoom = room;
            foundPlayer = player;
            roomCode = code;
          }
        });
      }
    }
    
    if (foundRoom && foundPlayer && roomCode) {
      foundPlayer.isConnected = false;
      
      // Handle host transfer
      if (foundPlayer.isHost) {
        const newHost = getConnectedPlayers(foundRoom).find(p => p.id !== foundPlayer!.id);
        
        if (newHost) {
          foundPlayer.isHost = false;
          newHost.isHost = true;
          foundRoom.hostId = newHost.id;
          io.to(roomCode).emit('host_changed', { newHostId: newHost.id });
        }
      }
      
      io.to(roomCode).emit('player_disconnected', { 
        playerId: foundPlayer.id, 
        playerName: foundPlayer.name 
      });
      broadcastRoomUpdate(foundRoom, io);

      // Schedule cleanup if all disconnected
      scheduleRoomCleanupIfEmpty(foundRoom, io);
    }
  };
}

// ============================================
// BOT HANDLER SETUP
// ============================================

function setupBotHandlers(io: SocketServer) {
  botManager.initialize(io, (code) => getRoom(code));
  
  botManager.registerActionHandler('vote_category', (data) => {
    const room = getRoom(data.roomCode);
    if (!room || room.state.phase !== 'category_voting') return;
    room.state.categoryVotes.set(data.playerId, data.categoryId);
    broadcastRoomUpdate(room, io);
    if (room.state.categoryVotes.size >= room.players.size) {
      finalizeCategoryVoting(room, io);
    }
  });

  botManager.registerActionHandler('submit_answer', (data) => {
    const room = getRoom(data.roomCode);
    if (!room || room.state.phase !== 'question') return;
    const player = room.players.get(data.playerId);
    if (!player || player.currentAnswer !== null) return;
    player.currentAnswer = data.answerIndex;
    player.answerTime = room.state.timerEnd ? room.state.timerEnd - Date.now() : 0;
    broadcastRoomUpdate(room, io);
    io.to(data.roomCode).emit('player_answered', { playerId: data.playerId, playerName: player.name });
    const allAnswered = Array.from(room.players.values()).every(
      p => p.currentAnswer !== null || !p.isConnected
    );
    if (allAnswered) {
      if (room.questionTimer) clearTimeout(room.questionTimer);
      showAnswer(room, io);
    }
  });

  botManager.registerActionHandler('submit_estimation', (data) => {
    const room = getRoom(data.roomCode);
    if (!room || room.state.phase !== 'estimation') return;
    const player = room.players.get(data.playerId);
    if (!player || player.estimationAnswer !== null) return;
    player.estimationAnswer = data.value;
    player.answerTime = room.state.timerEnd ? room.state.timerEnd - Date.now() : 0;
    broadcastRoomUpdate(room, io);
    io.to(data.roomCode).emit('player_answered', { playerId: data.playerId, playerName: player.name });
    const allEstimated = Array.from(room.players.values()).every(
      p => p.estimationAnswer !== null || !p.isConnected
    );
    if (allEstimated) {
      if (room.questionTimer) clearTimeout(room.questionTimer);
      showEstimationAnswer(room, io);
    }
  });

  botManager.registerActionHandler('loser_pick_category', (data) => {
    const room = getRoom(data.roomCode);
    if (!room || room.state.phase !== 'category_losers_pick') return;
    if (data.playerId !== room.state.loserPickPlayerId) return;
    finalizeLosersPick(room, io, data.categoryId);
  });

  botManager.registerActionHandler('dice_royale_roll', (data) => {
    const room = getRoom(data.roomCode);
    if (!room || room.state.phase !== 'category_dice_royale') return;
    const royale = room.state.diceRoyale;
    if (!royale || royale.phase !== 'rolling') return;
    if (!royale.playerRolls.has(data.playerId)) return;
    if (royale.playerRolls.get(data.playerId) !== null) return;
    if (royale.tiedPlayerIds && !royale.tiedPlayerIds.includes(data.playerId)) return;
    const rolls = [rollDie(), rollDie()];
    royale.playerRolls.set(data.playerId, rolls);
    io.to(room.code).emit('dice_royale_roll', { playerId: data.playerId, rolls });
    broadcastRoomUpdate(room, io);
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
    const room = getRoom(data.roomCode);
    if (!room || room.state.phase !== 'category_dice_royale') return;
    const royale = room.state.diceRoyale;
    if (!royale || royale.phase !== 'result') return;
    if (data.playerId !== royale.winnerId) return;
    finalizeDiceRoyalePick(room, io, data.categoryId);
  });

  botManager.registerActionHandler('rps_choice', (data) => {
    const room = getRoom(data.roomCode);
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
    const room = getRoom(data.roomCode);
    if (!room || room.state.phase !== 'category_rps_duel') return;
    const duel = room.state.rpsDuel;
    if (!duel || duel.phase !== 'result') return;
    if (data.playerId !== duel.winnerId) return;
    finalizeRPSDuelPick(room, io, data.categoryId);
  });

  botManager.registerActionHandler('bonus_round_submit', (data) => {
    const room = getRoom(data.roomCode);
    if (!room || room.state.phase !== 'bonus_round') return;
    const bonusRound = room.state.bonusRound;
    if (!bonusRound || bonusRound.phase !== 'playing') return;
    const currentPlayerId = bonusRound.activePlayers[bonusRound.currentTurnIndex % bonusRound.activePlayers.length];
    if (data.playerId !== currentPlayerId) return;
    handleBonusRoundAnswer(room, io, data.playerId, data.answer);
  });

  botManager.registerActionHandler('bonus_round_skip', (data) => {
    const room = getRoom(data.roomCode);
    if (!room || room.state.phase !== 'bonus_round') return;
    const bonusRound = room.state.bonusRound;
    if (!bonusRound || bonusRound.phase !== 'playing') return;
    const currentPlayerId = bonusRound.activePlayers[bonusRound.currentTurnIndex % bonusRound.activePlayers.length];
    if (data.playerId !== currentPlayerId) return;
    handleBonusRoundSkip(room, io, data.playerId);
  });
}

