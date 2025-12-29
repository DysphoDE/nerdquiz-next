/**
 * Shared Game Types
 */

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
}

// ============================================
// GAME STATE
// ============================================

export type GamePhase = 
  | 'lobby'
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
  | 'final';

export type CategorySelectionMode = 'voting' | 'wheel' | 'losers_pick' | 'dice_royale' | 'rps_duel';

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

export interface GameSettings {
  maxRounds: number;
  questionsPerRound: number;
  timePerQuestion: number;
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
  timerEnd: number | null;
  showingCorrectAnswer: boolean;
  wheelSelectedIndex: number | null; // Pre-selected wheel index for animation
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
