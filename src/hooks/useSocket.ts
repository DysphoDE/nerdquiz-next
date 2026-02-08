'use client';

import { useEffect, useCallback } from 'react';
import { useGameStore, type CollectiveListEndResult, type HotButtonBuzzEvent, type HotButtonEndResult } from '@/store/gameStore';
import type { RoomState, AnswerResult, FinalRanking, GameStatistics } from '@/types/game';
import { getSocket } from '@/lib/socket';
import { saveSession, clearSession } from '@/lib/session';
import { getSavedAvatarOptions, optionsToSeed } from '@/components/game/AvatarCustomizer';
import { useTimeSync } from './useTimeSync';

/** Default-Timeout für Socket-Callbacks in ms */
const SOCKET_CALLBACK_TIMEOUT = 10000;

/**
 * Wraps a socket.emit with a timeout.
 * Falls der Server nicht innerhalb von `timeoutMs` antwortet,
 * wird der Callback mit einem Fehler-Objekt aufgerufen.
 */
function emitWithTimeout<T extends Record<string, unknown>>(
  event: string,
  data: Record<string, unknown>,
  timeoutMs = SOCKET_CALLBACK_TIMEOUT,
): Promise<T> {
  return new Promise((resolve) => {
    const socket = getSocket();
    const timer = setTimeout(() => {
      resolve({ success: false, error: 'Server antwortet nicht (Timeout)' } as unknown as T);
    }, timeoutMs);

    socket.emit(event, data, (response: T) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

export function useSocket() {
  const {
    setConnected,
    setPlayer,
    setRoom,
    setLastResults,
    setFinalRankings,
    setGameStatistics,
    setCollectiveListResult,
    setHotButtonBuzz,
    setHotButtonEndResult,
    setScoreboardTtsText,
    resetQuestion,
    reset,
  } = useGameStore();

  // Initialize time synchronization
  // This runs automatically and keeps the time offset updated
  useTimeSync();

  useEffect(() => {
    const socket = getSocket();

    const handleConnect = () => {
      console.log('🔌 Connected to server');
      setConnected(true);
    };

    const handleDisconnect = () => {
      console.log('🔌 Disconnected from server');
      setConnected(false);
    };

    const handleRoomUpdate = (room: RoomState) => {
      console.log('📦 Room update:', room.phase);
      setRoom(room);
    };

    const handlePhaseChange = ({ phase }: { phase: string }) => {
      console.log('📍 Phase change:', phase);
      if (phase === 'question' || phase === 'estimation') {
        resetQuestion();
      }
    };

    const handleCategoryMode = (data: { mode: string; loserPlayerId?: string; loserPlayerName?: string }) => {
      console.log('🎲 Category mode:', data.mode, data.loserPlayerName || '');
    };

    const handleCategorySelected = (data: { categoryId: string; categoryName: string; categoryIcon: string }) => {
      console.log('📂 Category selected:', data.categoryName);
    };

    const handleAnswerReveal = (data: { correctIndex?: number; correctValue?: number; unit?: string; results: AnswerResult[] }) => {
      console.log('🎯 Answer reveal:', data);
      setLastResults(data.results);
    };

    const handleGameOver = ({ rankings, statistics }: { rankings: FinalRanking[]; statistics?: GameStatistics }) => {
      console.log('🏆 Game over:', rankings, statistics);
      setFinalRankings(rankings);
      if (statistics) {
        setGameStatistics(statistics);
      }
    };

    const handlePlayerJoined = ({ playerName }: { playerName: string }) => {
      console.log(`👤 ${playerName} joined`);
    };

    const handlePlayerDisconnected = ({ playerName }: { playerName: string }) => {
      console.log(`👋 ${playerName} disconnected`);
    };

    const handlePlayerAnswered = ({ playerName }: { playerName: string }) => {
      console.log(`✅ ${playerName} answered`);
    };

    const handleCollectiveListEnd = (data: CollectiveListEndResult) => {
      console.log('🎯 Collective list round ended:', data);
      setCollectiveListResult(data);
    };

    const handleHotButtonBuzz = (data: HotButtonBuzzEvent) => {
      console.log('🔔 Hot button buzz:', data);
      setHotButtonBuzz(data);
      // Auto-clear buzz after overlay duration
      setTimeout(() => setHotButtonBuzz(null), 2500);
    };

    const handleHotButtonEnd = (data: HotButtonEndResult) => {
      console.log('🏁 Hot button round ended:', data);
      setHotButtonEndResult(data);
    };

    const handleKickedFromRoom = (data: { reason: string }) => {
      console.log('👋 Kicked from room:', data.reason);
      clearSession();
      reset();
      // Redirect will happen via the component that detects null room
    };

    const handleScoreboardAnnouncement = (data: { ttsText: string }) => {
      console.log('📊 Scoreboard announcement received');
      setScoreboardTtsText(data.ttsText);
    };

    const handleRematchResult = (data: { rematch: boolean; newHostId?: string; newHostName?: string }) => {
      console.log('🔄 Rematch result:', data);
      if (data.rematch) {
        // Scores etc. are reset server-side, room_update will refresh the UI
        console.log(`🔄 Rematch starting! New host: ${data.newHostName}`);
      }
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('room_update', handleRoomUpdate);
    socket.on('phase_change', handlePhaseChange);
    socket.on('category_mode', handleCategoryMode);
    socket.on('category_selected', handleCategorySelected);
    socket.on('answer_reveal', handleAnswerReveal);
    socket.on('game_over', handleGameOver);
    socket.on('player_joined', handlePlayerJoined);
    socket.on('player_disconnected', handlePlayerDisconnected);
    socket.on('player_answered', handlePlayerAnswered);
    socket.on('collective_list_end', handleCollectiveListEnd);
    socket.on('hot_button_buzz', handleHotButtonBuzz);
    socket.on('hot_button_end', handleHotButtonEnd);
    socket.on('kicked_from_room', handleKickedFromRoom);
    socket.on('scoreboard_announcement', handleScoreboardAnnouncement);
    socket.on('rematch_result', handleRematchResult);

    // Connect if not already connected
    if (!socket.connected) {
      socket.connect();
    } else {
      setConnected(true);
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('room_update', handleRoomUpdate);
      socket.off('phase_change', handlePhaseChange);
      socket.off('category_mode', handleCategoryMode);
      socket.off('category_selected', handleCategorySelected);
      socket.off('answer_reveal', handleAnswerReveal);
      socket.off('game_over', handleGameOver);
      socket.off('player_joined', handlePlayerJoined);
      socket.off('player_disconnected', handlePlayerDisconnected);
      socket.off('player_answered', handlePlayerAnswered);
      socket.off('collective_list_end', handleCollectiveListEnd);
      socket.off('hot_button_buzz', handleHotButtonBuzz);
      socket.off('hot_button_end', handleHotButtonEnd);
      socket.off('kicked_from_room', handleKickedFromRoom);
      socket.off('scoreboard_announcement', handleScoreboardAnnouncement);
      socket.off('rematch_result', handleRematchResult);
    };
  }, [setConnected, setRoom, setLastResults, setFinalRankings, setGameStatistics, setCollectiveListResult, setHotButtonBuzz, setHotButtonEndResult, setScoreboardTtsText, resetQuestion, reset]);

  // === API Methods ===
  // All methods automatically get roomCode and playerId from store

  const createRoom = useCallback(async (playerName: string): Promise<{ success: boolean; roomCode?: string; error?: string }> => {
    // Get saved avatar options from localStorage
    const savedOptions = getSavedAvatarOptions();
    const avatarOptions = savedOptions ? optionsToSeed(savedOptions) : undefined;
    
    const response = await emitWithTimeout<{ success: boolean; roomCode?: string; playerId?: string; room?: RoomState; error?: string }>(
      'create_room',
      { playerName, avatarOptions },
    );
    
    if (response.success && response.playerId && response.roomCode) {
      setPlayer(response.playerId, response.roomCode);
      setRoom(response.room!);
      saveSession({
        playerId: response.playerId,
        roomCode: response.roomCode,
        playerName: playerName.trim(),
      });
    }
    return response;
  }, [setPlayer, setRoom]);

  const joinRoom = useCallback(async (roomCode: string, playerName: string): Promise<{ success: boolean; error?: string }> => {
    // Get saved avatar options from localStorage
    const savedOptions = getSavedAvatarOptions();
    const avatarOptions = savedOptions ? optionsToSeed(savedOptions) : undefined;
    
    const response = await emitWithTimeout<{ success: boolean; playerId?: string; roomCode?: string; room?: RoomState; error?: string }>(
      'join_room',
      { roomCode, playerName, avatarOptions },
    );
    
    if (response.success && response.playerId && response.roomCode) {
      setPlayer(response.playerId, response.roomCode);
      setRoom(response.room!);
      saveSession({
        playerId: response.playerId,
        roomCode: response.roomCode,
        playerName: playerName.trim(),
      });
    }
    return response;
  }, [setPlayer, setRoom]);

  const reconnectPlayer = useCallback(async (roomCode: string, playerId: string): Promise<{ success: boolean; error?: string }> => {
    const response = await emitWithTimeout<{ success: boolean; room?: RoomState; error?: string }>(
      'reconnect_player',
      { roomCode, playerId },
    );
    
    if (response.success) {
      setPlayer(playerId, roomCode);
      setRoom(response.room!);
      console.log('🔄 Reconnected to room:', roomCode);
    }
    return response;
  }, [setPlayer, setRoom]);

  const updateSettings = useCallback((settings: Record<string, unknown>) => {
    const socket = getSocket();
    const { playerId, roomCode } = useGameStore.getState();
    if (!roomCode || !playerId) return;
    socket.emit('update_settings', { roomCode, playerId, settings });
  }, []);

  const startGame = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    const { playerId, roomCode } = useGameStore.getState();
    
    if (!roomCode || !playerId) {
      return { success: false, error: 'Nicht in einem Raum' };
    }
    
    console.log('🚀 Starting game:', { roomCode, playerId });
    const response = await emitWithTimeout<{ success: boolean; error?: string }>(
      'start_game',
      { roomCode, playerId },
    );
    console.log('🚀 Start game response:', response);
    return response;
  }, []);

  const voteCategory = useCallback((categoryId: string) => {
    const socket = getSocket();
    const { playerId, roomCode } = useGameStore.getState();
    if (!roomCode || !playerId) return;
    socket.emit('vote_category', { roomCode, playerId, categoryId });
  }, []);

  const loserPickCategory = useCallback((categoryId: string) => {
    const socket = getSocket();
    const { playerId, roomCode } = useGameStore.getState();
    if (!roomCode || !playerId) return;
    socket.emit('loser_pick_category', { roomCode, playerId, categoryId });
  }, []);

  const submitAnswer = useCallback((answerIndex: number) => {
    const socket = getSocket();
    const { playerId, roomCode } = useGameStore.getState();
    if (!roomCode || !playerId) return;
    socket.emit('submit_answer', { roomCode, playerId, answerIndex });
  }, []);

  const submitEstimation = useCallback((value: number) => {
    const socket = getSocket();
    const { playerId, roomCode } = useGameStore.getState();
    if (!roomCode || !playerId) return;
    socket.emit('submit_estimation', { roomCode, playerId, value });
  }, []);

  const next = useCallback(() => {
    const socket = getSocket();
    const { playerId, roomCode } = useGameStore.getState();
    if (!roomCode || !playerId) return;
    socket.emit('next', { roomCode, playerId });
  }, []);

  const leaveGame = useCallback(() => {
    // Deactivate dev mode when leaving a room
    const { deactivateDevMode } = require('@/lib/devMode');
    deactivateDevMode();
    
    clearSession();
    reset();
  }, [reset]);

  const rerollAvatar = useCallback(() => {
    const socket = getSocket();
    const { playerId, roomCode } = useGameStore.getState();
    if (!roomCode || !playerId) return;
    socket.emit('reroll_avatar', { roomCode, playerId });
  }, []);

  const updateAvatar = useCallback((avatarOptions: string) => {
    const socket = getSocket();
    const { playerId, roomCode } = useGameStore.getState();
    if (!roomCode || !playerId) return;
    socket.emit('update_avatar', { roomCode, playerId, avatarOptions });
  }, []);

  const submitCollectiveListAnswer = useCallback((answer: string) => {
    const socket = getSocket();
    const { playerId, roomCode } = useGameStore.getState();
    if (!roomCode || !playerId) return;
    socket.emit('collective_list_submit', { roomCode, playerId, answer });
  }, []);

  const skipCollectiveListTurn = useCallback(() => {
    const socket = getSocket();
    const { playerId, roomCode } = useGameStore.getState();
    if (!roomCode || !playerId) return;
    socket.emit('collective_list_skip', { roomCode, playerId });
  }, []);
  
  const buzzHotButton = useCallback(() => {
    const socket = getSocket();
    const { playerId, roomCode } = useGameStore.getState();
    if (!roomCode || !playerId) return;
    socket.emit('hot_button_buzz', { roomCode, playerId });
  }, []);

  const submitHotButtonAnswer = useCallback((answer: string) => {
    const socket = getSocket();
    const { playerId, roomCode } = useGameStore.getState();
    if (!roomCode || !playerId) return;
    socket.emit('hot_button_submit', { roomCode, playerId, answer });
  }, []);

  const voteRematch = useCallback((vote: 'yes' | 'no') => {
    const socket = getSocket();
    const { playerId, roomCode } = useGameStore.getState();
    if (!roomCode || !playerId) return;
    socket.emit('vote_rematch', { roomCode, playerId, vote });
  }, []);

  const emitGameStartReady = useCallback(() => {
    const socket = getSocket();
    const { roomCode } = useGameStore.getState();
    if (!roomCode) return;
    console.log('🎬 Emitting game_start_ready');
    socket.emit('game_start_ready', { roomCode });
  }, []);

  const emitCollectiveListIntroDone = useCallback(() => {
    const socket = getSocket();
    const { roomCode } = useGameStore.getState();
    if (!roomCode) return;
    console.log('📋 Emitting collective_list_intro_done');
    socket.emit('collective_list_intro_done', { roomCode });
  }, []);

  const emitScoreboardTtsDone = useCallback(() => {
    const socket = getSocket();
    const { roomCode } = useGameStore.getState();
    if (!roomCode) return;
    console.log('📊 Emitting scoreboard_tts_done');
    socket.emit('scoreboard_tts_done', { roomCode });
  }, []);

  return {
    createRoom,
    joinRoom,
    reconnectPlayer,
    updateSettings,
    startGame,
    voteCategory,
    loserPickCategory,
    submitAnswer,
    submitEstimation,
    next,
    leaveGame,
    rerollAvatar,
    updateAvatar,
    submitCollectiveListAnswer,
    skipCollectiveListTurn,
    buzzHotButton,
    submitHotButtonAnswer,
    voteRematch,
    emitGameStartReady,
    emitCollectiveListIntroDone,
    emitScoreboardTtsDone,
  };
}
