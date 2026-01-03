/**
 * Shared Game Types
 */

// Import and re-export CategorySelectionMode from central config
import type { CategorySelectionMode } from '@/config/gameModes.shared';
export type { CategorySelectionMode };

// ============================================
// PLAYER
// ============================================

export interface Player {
  id: string;
  name: string;
  avatarSeed: string;
  score: number;
  isHost: boolean;
  isConnected: boolean;
  hasAnswered: boolean;
  streak: number;
}

// ============================================
// CATEGORY
// ============================================

export interface Category {
  id: string;
  name: string;
  icon: string;
  questionCount: number;
}

// ============================================
// QUESTION
// ============================================

export type QuestionType = 'choice' | 'estimation';
export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

export interface Question {
  id: string;
  text: string;
  type: QuestionType;
  category: string;
  categoryIcon: string;
  // For multiple choice
  answers?: string[];
  correctIndex?: number;
  // For estimation
  unit?: string;
  correctValue?: number;
  // Optional explanation shown after reveal
  explanation?: string;
  // Difficulty level (only used in dev mode for quick editing)
  difficulty?: Difficulty;
}

// ============================================
// GAME STATE
// ============================================

export type GamePhase = 
  | 'lobby'
  | 'round_announcement'      // NEU: Rundenankündigung mit Roulette
  | 'category_announcement'   // Legacy: wird zu round_announcement migriert
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
  | 'bonus_round_announcement' // NEU: Bonusrunden-Ankündigung mit Roulette
  | 'bonus_round'
  | 'bonus_round_result'
  | 'final'
  | 'rematch_voting'; // NEU: "Nochmal spielen?" Voting

// CategorySelectionMode is now exported from @/config/gameModes.shared

// Dice Royale - All players roll, highest wins
export interface DiceRoyaleState {
  playerRolls: Record<string, number[] | null>; // playerId -> [die1, die2]
  winnerId: string | null;
  tiedPlayerIds: string[] | null; // Players who need to re-roll
  phase: 'rolling' | 'reroll' | 'result';
  round: number; // Track tie-breaker rounds
}

// Rock Paper Scissors Duel - 2 players, best of 3
export type RPSChoice = 'rock' | 'paper' | 'scissors';

export interface RPSDuelState {
  player1Id: string;
  player2Id: string;
  player1Choices: RPSChoice[];
  player2Choices: RPSChoice[];
  player1Wins: number;
  player2Wins: number;
  currentRound: number; // 1, 2, or 3
  winnerId: string | null;
  phase: 'selecting' | 'choosing' | 'revealing' | 'result';
}

// ============================================
// BONUS ROUND - Collective List
// ============================================

export interface BonusRoundItem {
  id: string;
  display: string;
  group?: string; // Optional grouping (e.g., "West", "East")
  guessedBy?: string; // Player ID who guessed it
  guessedByName?: string;
  guessedAt?: number; // Timestamp
  aliases?: string[]; // Only present for already guessed items (for duplicate detection)
}

export interface BonusRoundState {
  phase: 'intro' | 'playing' | 'finished';
  questionId?: string; // DB question ID for dev-mode editing
  topic: string;
  description?: string;
  category?: string;
  categoryIcon?: string;
  questionType?: string; // z.B. "Liste", "Sortieren"
  totalItems: number;
  items: BonusRoundItem[]; // All items (revealed ones have guessedBy set)
  revealedCount: number;
  currentTurn: {
    playerId: string;
    playerName: string;
    avatarSeed: string;
    turnNumber: number;
    timerEnd: number;
  } | null;
  turnOrder: string[]; // Player IDs in play order (worst to best score)
  activePlayers: string[]; // Players still in the round
  eliminatedPlayers: Array<{
    playerId: string;
    playerName: string;
    avatarSeed: string;
    eliminationReason: 'wrong' | 'timeout' | 'skip';
    rank: number; // Final rank (1 = winner, higher = earlier elimination)
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
}

export interface GameSettings {
  maxRounds: number;
  questionsPerRound: number;
  timePerQuestion: number;
  // Bonusrunden-Einstellungen
  bonusRoundChance: number; // 0-100, Wahrscheinlichkeit dass eine Runde zur Bonusrunde wird
  finalRoundAlwaysBonus: boolean; // Letzte Runde immer als Bonusrunde
  // Zukünftige Erweiterungen
  enableEstimation: boolean; // Schätzfragen aktiviert
  enableMediaQuestions: boolean; // Bild/Audio/Video Fragen
}

export interface RoomState {
  code: string;
  players: Player[];
  settings: GameSettings;
  phase: GamePhase;
  currentRound: number;
  currentQuestionIndex: number;
  totalQuestions: number;
  currentQuestion: Question | null;
  categorySelectionMode: CategorySelectionMode | null;
  votingCategories: Category[];
  categoryVotes: Record<string, string>;
  selectedCategory: string | null;
  loserPickPlayerId: string | null;
  diceRoyale: DiceRoyaleState | null;
  rpsDuel: RPSDuelState | null;
  bonusRound: BonusRoundState | null;
  timerEnd: number | null;
  showingCorrectAnswer: boolean;
  wheelSelectedIndex: number | null; // Pre-selected wheel index for animation
  rematchVotes: Record<string, 'yes' | 'no'>; // Rematch voting state
}

// ============================================
// SOCKET EVENTS
// ============================================

export interface AnswerResult {
  playerId: string;
  playerName: string;
  avatarSeed: string;
  correct: boolean;
  // Points breakdown
  points: number;
  basePoints: number;
  timeBonus: number;
  streakBonus: number;
  streak: number;
  newScore: number;
  // Timing & order
  answerOrder: number | null; // 1 = first to answer, null = didn't answer
  responseTimeMs: number | null; // Time taken to answer in ms
  // For choice questions
  answer?: number;
  // For estimation questions
  estimation?: number;
  diff?: number; // Signed difference from correct answer
  absDiff?: number; // Absolute difference
  rank?: number; // Ranking position (1 = best)
  // Estimation scoring breakdown (accuracy-based)
  accuracyPoints?: number; // Points based on how close the guess was
  rankBonus?: number; // Bonus points for placement
  perfectBonus?: number; // Bonus for exact answer
}

export interface FinalRanking {
  rank: number;
  playerId: string;
  name: string;
  score: number;
  avatarSeed: string;
}

// ============================================
// GAME STATISTICS (from server)
// ============================================

export interface PlayerStatistics {
  playerId: string;
  playerName: string;
  avatarSeed: string;
  correctAnswers: number;
  totalAnswers: number;
  accuracy: number; // 0-100
  estimationPoints: number;
  estimationQuestions: number;
  fastestAnswer: number | null; // ms
  longestStreak: number;
}

export interface CategoryPerformance {
  category: string;
  correct: number;
  total: number;
  accuracy: number; // 0-100
}

export interface BestEstimator {
  playerId: string;
  playerName: string;
  avatarSeed: string;
  points: number;
  questions: number;
}

export interface FastestFinger {
  playerId: string;
  playerName: string;
  avatarSeed: string;
  avgResponseTime: number | null; // ms
  responsesCount: number;
}

export interface GameStatistics {
  totalQuestions: number;
  playerStatistics: PlayerStatistics[];
  bestEstimator: BestEstimator | null;
  fastestFingers: FastestFinger[];
  bestCategory: CategoryPerformance | null;
  worstCategory: CategoryPerformance | null;
  categoryPerformance: CategoryPerformance[];
}

// ============================================
// REMATCH VOTING
// ============================================

export interface RematchVote {
  playerId: string;
  playerName: string;
  avatarSeed: string;
  vote: 'yes' | 'no' | null; // null = hasn't voted yet
}

export interface RematchVotingState {
  votes: Record<string, 'yes' | 'no'>; // playerId -> vote
  timerEnd: number;
}

// ============================================
// CLIENT STATE
// ============================================

export interface ClientState {
  // Connection
  isConnected: boolean;
  playerId: string | null;
  roomCode: string | null;
  
  // Room
  room: RoomState | null;
  
  // UI
  selectedAnswer: number | null;
  estimationValue: string;
  hasSubmitted: boolean;
  
  // Results
  lastResults: AnswerResult[] | null;
  finalRankings: FinalRanking[] | null;
}
