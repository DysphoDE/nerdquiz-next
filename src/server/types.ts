/**
 * Server-Side Types for NerdQuiz Game Server
 * 
 * Diese Typen werden NUR auf dem Server verwendet.
 * Für Client-Typen siehe src/types/game.ts
 */

import type { CategorySelectionMode } from '@/config/gameModes.shared';

// Re-export for convenience
export type { CategorySelectionMode };

// ============================================
// QUESTION DATA (from JSON files)
// ============================================

export interface QuestionData {
  question: string;
  answers?: string[];
  correct?: number;
  correctAnswer?: number;
  unit?: string;
}

export interface CategoryData {
  name: string;
  icon: string;
  questions: QuestionData[];
  estimationQuestions?: QuestionData[];
}

// ============================================
// CATEGORY INFO (for voting/selection)
// ============================================

export interface CategoryInfo {
  id: string;
  name: string;
  icon: string;
  questionCount: number;
}

// ============================================
// PLAYER
// ============================================

export interface Player {
  id: string;
  socketId: string;
  name: string;
  avatarSeed: string;
  score: number;
  isHost: boolean;
  isConnected: boolean;
  currentAnswer: number | null;
  estimationAnswer: number | null;
  answerTime: number | null;
  streak: number;
}

// ============================================
// GAME QUESTION
// ============================================

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

export interface GameQuestion {
  id: string;
  text: string;
  type: 'choice' | 'estimation';
  answers?: string[];
  correctIndex?: number;
  correctValue?: number;
  unit?: string;
  category: string;
  categoryIcon: string;
  explanation?: string;
  // Difficulty for dev-mode quick editing
  difficulty?: Difficulty;
}

// ============================================
// DICE ROYALE STATE
// ============================================

export interface DiceRoyaleState {
  playerRolls: Map<string, number[] | null>;
  winnerId: string | null;
  tiedPlayerIds: string[] | null;
  phase: 'rolling' | 'reroll' | 'result';
  round: number;
}

// ============================================
// RPS DUEL STATE
// ============================================

export type RPSChoice = 'rock' | 'paper' | 'scissors';

export interface RPSDuelState {
  player1Id: string;
  player2Id: string;
  player1Choices: RPSChoice[];
  player2Choices: RPSChoice[];
  player1Wins: number;
  player2Wins: number;
  currentRound: number;
  winnerId: string | null;
  phase: 'selecting' | 'choosing' | 'revealing' | 'result';
}

// ============================================
// BONUS ROUND STATE
// ============================================

export interface BonusRoundItem {
  id: string;
  display: string;
  aliases: string[];
  group?: string;
  guessedBy?: string;
  guessedByName?: string;
  guessedAt?: number;
}

export interface ServerBonusRoundState {
  phase: 'intro' | 'playing' | 'finished';
  topic: string;
  description?: string;
  category?: string;
  categoryIcon?: string;
  questionType?: string;
  items: BonusRoundItem[];
  guessedIds: Set<string>;
  currentTurnIndex: number;
  currentTurnTimer: NodeJS.Timeout | null;
  turnOrder: string[];
  activePlayers: string[];
  eliminatedPlayers: Array<{
    playerId: string;
    playerName: string;
    avatarSeed: string;
    eliminationReason: 'wrong' | 'timeout' | 'skip';
    rank: number;
  }>;
  lastGuess?: {
    playerId: string;
    playerName: string;
    input: string;
    result: 'correct' | 'wrong' | 'already_guessed' | 'timeout' | 'skip';
    matchedDisplay?: string;
    confidence?: number;
  };
  pointsPerCorrect: number;
  timePerTurn: number;
  fuzzyThreshold: number;
  turnNumber: number;
  playerCorrectCounts: Map<string, number>;
}

// ============================================
// GAME PHASE
// ============================================

export type GamePhase = 
  | 'lobby' 
  | 'round_announcement' 
  | 'category_announcement' 
  | 'category_voting' 
  | 'category_wheel' 
  | 'category_losers_pick' 
  | 'category_dice_royale' 
  | 'category_rps_duel' 
  | 'question' 
  | 'estimation' 
  | 'revealing' 
  | 'estimation_reveal' 
  | 'scoreboard' 
  | 'bonus_round_announcement' 
  | 'bonus_round' 
  | 'bonus_round_result' 
  | 'final' 
  | 'rematch_voting';

// ============================================
// GAME SETTINGS
// ============================================

export interface GameSettings {
  maxRounds: number;
  questionsPerRound: number;
  timePerQuestion: number;
  bonusRoundChance: number;
  finalRoundAlwaysBonus: boolean;
  enableEstimation: boolean;
  enableMediaQuestions: boolean;
}

// ============================================
// GAME STATE
// ============================================

export interface GameState {
  phase: GamePhase;
  currentRound: number;
  currentQuestionIndex: number;
  currentQuestion: GameQuestion | null;
  categorySelectionMode: CategorySelectionMode | null;
  votingCategories: CategoryInfo[];
  categoryVotes: Map<string, string>;
  selectedCategory: string | null;
  roundQuestions: GameQuestion[];
  timerEnd: number | null;
  showingCorrectAnswer: boolean;
  loserPickPlayerId: string | null;
  lastLoserPickRound: number;
  diceRoyale: DiceRoyaleState | null;
  rpsDuel: RPSDuelState | null;
  bonusRound: ServerBonusRoundState | null;
  wheelSelectedIndex: number | null;
  usedQuestionIds: Set<string>;
  usedBonusQuestionIds: Set<string>;
  rematchVotes: Map<string, 'yes' | 'no'>;
  // Game Statistics (tracked during gameplay)
  statistics: GameStatistics;
}

// ============================================
// GAME ROOM
// ============================================

export interface GameRoom {
  code: string;
  hostId: string;
  players: Map<string, Player>;
  settings: GameSettings;
  state: GameState;
  createdAt: Date;
  // Runtime properties (not part of base state)
  questionTimer?: NodeJS.Timeout;
  forcedCategoryMode?: CategorySelectionMode;
  pendingBonusQuestion?: BonusRoundConfig;
  // Dev mode enabled via secret code (for production testing)
  devModeEnabled?: boolean;
  // Endless mode properties
  isEndlessMode?: boolean;
  endlessCategoryId?: string;
}

// ============================================
// BONUS ROUND CONFIG
// ============================================

export interface BonusRoundConfig {
  id?: string;
  topic: string;
  description?: string;
  category?: string;
  categoryIcon?: string;
  questionType?: string;
  items: Array<{ id: string; display: string; aliases: string[]; group?: string }>;
  timePerTurn?: number;
  fuzzyThreshold?: number;
  pointsPerCorrect?: number;
}

// ============================================
// ANSWER RESULT (for scoring)
// ============================================

export interface AnswerResult {
  playerId: string;
  playerName: string;
  avatarSeed: string;
  correct: boolean;
  points: number;
  basePoints: number;
  timeBonus: number;
  streakBonus: number;
  streak: number;
  newScore: number;
  answer?: number;
  answerOrder: number | null;
  responseTimeMs: number | null;
  // Estimation-specific
  estimation?: number;
  diff?: number;
  absDiff?: number | null;
  rank?: number;
  accuracyPoints?: number;
  rankBonus?: number;
  perfectBonus?: number;
}

// ============================================
// PLAYER SCORE BREAKDOWN (Bonus Round)
// ============================================

export interface PlayerScoreBreakdown {
  playerId: string;
  playerName: string;
  avatarSeed: string;
  correctAnswers: number;
  correctPoints: number;
  rankBonus: number;
  totalPoints: number;
  rank: number;
}

// ============================================
// GAME STATISTICS (Tracking during game)
// ============================================

export interface PlayerGameStats {
  playerId: string;
  correctAnswers: number;
  totalAnswers: number;
  estimationPoints: number;
  estimationQuestions: number;
  categoryStats: Map<string, { correct: number; total: number }>;
  fastestAnswer: number | null; // ms
  longestStreak: number;
  // For calculating average response time
  totalResponseTime: number; // sum of all response times in ms
  responsesCount: number; // number of timed responses
}

export interface GameStatistics {
  playerStats: Map<string, PlayerGameStats>;
  categoryPerformance: Map<string, { correct: number; total: number }>;
  totalQuestions: number;
}

export function createInitialPlayerStats(playerId: string): PlayerGameStats {
  return {
    playerId,
    correctAnswers: 0,
    totalAnswers: 0,
    estimationPoints: 0,
    estimationQuestions: 0,
    categoryStats: new Map(),
    fastestAnswer: null,
    longestStreak: 0,
    totalResponseTime: 0,
    responsesCount: 0,
  };
}

export function createInitialGameStatistics(): GameStatistics {
  return {
    playerStats: new Map(),
    categoryPerformance: new Map(),
    totalQuestions: 0,
  };
}

// ============================================
// DEFAULT SETTINGS
// ============================================

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  maxRounds: 5,
  questionsPerRound: 5,
  timePerQuestion: 20,
  bonusRoundChance: 0,
  finalRoundAlwaysBonus: true, // Standard: Letzte Runde ist immer Bonusrunde
  enableEstimation: true,
  enableMediaQuestions: false,
};

// ============================================
// INITIAL GAME STATE
// ============================================

export function createInitialGameState(): GameState {
  return {
    phase: 'lobby',
    currentRound: 1,
    currentQuestionIndex: 0,
    currentQuestion: null,
    categorySelectionMode: null,
    votingCategories: [],
    categoryVotes: new Map(),
    selectedCategory: null,
    roundQuestions: [],
    timerEnd: null,
    showingCorrectAnswer: false,
    loserPickPlayerId: null,
    lastLoserPickRound: 0,
    diceRoyale: null,
    rpsDuel: null,
    bonusRound: null,
    wheelSelectedIndex: null,
    usedQuestionIds: new Set(),
    usedBonusQuestionIds: new Set(),
    rematchVotes: new Map(),
    statistics: createInitialGameStatistics(),
  };
}

