/**
 * Zustand Game Store
 */

import { create } from 'zustand';
import type { RoomState, AnswerResult, FinalRanking, Player, GameStatistics } from '@/types/game';

// Collective List End Result
export interface CollectiveListPlayerScore {
  playerId: string;
  playerName: string;
  avatarSeed: string;
  correctAnswers: number;
  correctPoints: number;
  rankBonus: number;
  totalPoints: number;
  rank: number;
}

export interface CollectiveListEndResult {
  reason: 'last_standing' | 'all_guessed';
  winners: Array<{ playerId: string; playerName: string; avatarSeed: string }>;
  winnerBonus: number;
  pointsPerCorrect: number;
  totalRevealed: number;
  totalItems: number;
  playerScoreBreakdown: CollectiveListPlayerScore[];
}

// Hot Button Events
export interface HotButtonBuzzEvent {
  playerId: string;
  playerName: string;
  avatarSeed: string;
  buzzTimeMs: number;
  revealedPercent: number;
  timerEnd: number;
}

export interface HotButtonEndPlayerScore {
  playerId: string;
  playerName: string;
  avatarSeed: string;
  totalPoints: number;
  rank: number;
}

export interface HotButtonEndResult {
  totalQuestions: number;
  playerScoreBreakdown: HotButtonEndPlayerScore[];
}

interface GameStore {
  // Connection
  isConnected: boolean;
  playerId: string | null;
  roomCode: string | null;

  // Room State
  room: RoomState | null;

  // UI State
  selectedAnswer: number | null;
  estimationValue: string;
  hasSubmitted: boolean;

  // Game Start Overlay
  // Detected in setRoom (outside React rendering) to avoid React Compiler issues
  gameStartPending: boolean;

  // Results
  lastResults: AnswerResult[] | null;
  finalRankings: FinalRanking[] | null;
  gameStatistics: GameStatistics | null;
  collectiveListResult: CollectiveListEndResult | null;

  // Hot Button specific state
  hotButtonBuzz: HotButtonBuzzEvent | null;
  hotButtonEndResult: HotButtonEndResult | null;

  // Scoreboard TTS
  scoreboardTtsUrl: string | null;

  // Actions
  setConnected: (connected: boolean) => void;
  setPlayer: (playerId: string, roomCode: string) => void;
  setRoom: (room: RoomState | null) => void;
  setSelectedAnswer: (index: number | null) => void;
  setEstimationValue: (value: string) => void;
  setHasSubmitted: (submitted: boolean) => void;
  setLastResults: (results: AnswerResult[] | null) => void;
  setFinalRankings: (rankings: FinalRanking[] | null) => void;
  setGameStatistics: (stats: GameStatistics | null) => void;
  setCollectiveListResult: (result: CollectiveListEndResult | null) => void;
  setHotButtonBuzz: (buzz: HotButtonBuzzEvent | null) => void;
  setHotButtonEndResult: (result: HotButtonEndResult | null) => void;
  setScoreboardTtsUrl: (text: string | null) => void;
  clearGameStartPending: () => void;

  // Utility
  reset: () => void;
  resetQuestion: () => void;
}

const initialState = {
  isConnected: false,
  playerId: null as string | null,
  roomCode: null as string | null,
  room: null as RoomState | null,
  selectedAnswer: null as number | null,
  estimationValue: '',
  hasSubmitted: false,
  gameStartPending: false,
  lastResults: null as AnswerResult[] | null,
  finalRankings: null as FinalRanking[] | null,
  gameStatistics: null as GameStatistics | null,
  collectiveListResult: null as CollectiveListEndResult | null,
  hotButtonBuzz: null as HotButtonBuzzEvent | null,
  hotButtonEndResult: null as HotButtonEndResult | null,
  scoreboardTtsUrl: null as string | null,
};

export const useGameStore = create<GameStore>((set, get) => ({
  ...initialState,
  
  setConnected: (connected) => set({ isConnected: connected }),
  
  setPlayer: (playerId, roomCode) => set({ playerId, roomCode }),
  
  setRoom: (room) => {
    const prevPhase = get().room?.phase ?? null;
    const newPhase = room?.phase ?? null;
    // Detect lobby → game transition (outside React rendering pipeline)
    const isGameStart = prevPhase === 'lobby' && newPhase !== null && newPhase !== 'lobby';
    set({ room, ...(isGameStart ? { gameStartPending: true } : {}) });
  },
  
  setSelectedAnswer: (index) => set({ selectedAnswer: index }),
  
  setEstimationValue: (value) => set({ estimationValue: value }),
  
  setHasSubmitted: (submitted) => set({ hasSubmitted: submitted }),
  
  setLastResults: (results) => set({ lastResults: results }),
  
  setFinalRankings: (rankings) => set({ finalRankings: rankings }),
  
  setGameStatistics: (stats) => set({ gameStatistics: stats }),
  
  setCollectiveListResult: (result) => set({ collectiveListResult: result }),
  
  setHotButtonBuzz: (buzz) => set({ hotButtonBuzz: buzz }),
  
  setHotButtonEndResult: (result) => set({ hotButtonEndResult: result }),

  setScoreboardTtsUrl: (text) => set({ scoreboardTtsUrl: text }),

  clearGameStartPending: () => set({ gameStartPending: false }),

  reset: () => set(initialState),
  
  resetQuestion: () => set({ 
    selectedAnswer: null, 
    estimationValue: '',
    hasSubmitted: false,
    lastResults: null,
    hotButtonBuzz: null,
    hotButtonEndResult: null,
  }),
}));

// Hook-based selectors
export const useIsHost = () => {
  const playerId = useGameStore((s) => s.playerId);
  const players = useGameStore((s) => s.room?.players);
  
  if (!playerId || !players) return false;
  return players.find(p => p.id === playerId)?.isHost ?? false;
};

export const useCurrentPlayer = () => {
  const playerId = useGameStore((s) => s.playerId);
  const players = useGameStore((s) => s.room?.players);
  
  if (!playerId || !players) return null;
  return players.find(p => p.id === playerId) ?? null;
};

export const usePlayers = () => useGameStore((s) => s.room?.players ?? []);

export const useMyResult = () => {
  const playerId = useGameStore((s) => s.playerId);
  const lastResults = useGameStore((s) => s.lastResults);
  
  if (!playerId || !lastResults) return null;
  return lastResults.find(r => r.playerId === playerId) ?? null;
};
