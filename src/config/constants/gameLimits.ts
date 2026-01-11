/**
 * Game Limits Constants
 * 
 * Limits, Schwellenwerte und Mechanik-Konstanten für das Spiel.
 */

// ============================================
// ROOM LIMITS
// ============================================

/**
 * Limits für Spielräume
 */
export const ROOM_LIMITS = {
  /** Maximale Anzahl Spieler pro Raum */
  MAX_PLAYERS: 12,
  
  /** Minimale Anzahl Spieler zum Starten */
  MIN_PLAYERS: 1,
  
  /** Room-Code Länge */
  CODE_LENGTH: 4,
  
  /** Erlaubte Zeichen für Room-Codes (keine Verwechslungsgefahr: kein O/0, I/1, etc.) */
  CODE_CHARS: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
} as const;

// ============================================
// HOT BUTTON LIMITS
// ============================================

/**
 * Limits für Hot Button Bonus Round
 */
export const HOT_BUTTON_LIMITS = {
  /** Maximale Anzahl Rebuzz-Versuche pro Frage */
  MAX_REBUZZ_ATTEMPTS: 2,
  
  /** Standard-Anzahl Fragen pro Hot Button Runde */
  DEFAULT_QUESTIONS: 5,
  
  /** Minimale Anzahl Fragen */
  MIN_QUESTIONS: 1,
  
  /** Maximale Anzahl Fragen */
  MAX_QUESTIONS: 10,
} as const;

// ============================================
// COLLECTIVE LIST LIMITS
// ============================================

/**
 * Limits für Collective List Bonus Round
 */
export const COLLECTIVE_LIST_LIMITS = {
  /** Minimale Anzahl Items in einer Liste */
  MIN_ITEMS: 5,
  
  /** Empfohlene Anzahl Items */
  RECOMMENDED_ITEMS: 20,
} as const;

// ============================================
// MATCHING & VALIDATION
// ============================================

/**
 * Fuzzy Matching und Validierungs-Schwellenwerte
 */
export const MATCHING = {
  /** Fuzzy Match Threshold (0.0 - 1.0, höher = strenger) */
  FUZZY_THRESHOLD: 0.85,
  
  /** Minimale Confidence für akzeptierte Antwort */
  MIN_CONFIDENCE: 0.7,
} as const;

// ============================================
// CATEGORY SELECTION
// ============================================

/**
 * Limits für Kategorie-Auswahl
 */
export const CATEGORY_LIMITS = {
  /** Maximale Anzahl Segmente im Glücksrad */
  WHEEL_MAX_SEGMENTS: 8,
  
  /** Anzahl Kategorien für Voting */
  VOTING_CATEGORIES: 3,
} as const;

// ============================================
// RPS DUEL
// ============================================

/**
 * Rock-Paper-Scissors Duel Mechanik
 */
export const RPS_DUEL = {
  /** Anzahl gewonnener Runden für Sieg */
  ROUNDS_TO_WIN: 2,
  
  /** Maximale Anzahl Runden */
  MAX_ROUNDS: 3,
} as const;

// ============================================
// DICE ROYALE
// ============================================

/**
 * Dice Royale Mechanik
 */
export const DICE_ROYALE = {
  /** Anzahl Würfel pro Spieler */
  DICE_PER_PLAYER: 2,
  
  /** Würfel-Seiten */
  DICE_SIDES: 6,
  
  /** Maximale Re-Roll Runden bei Unentschieden */
  MAX_REROLL_ROUNDS: 10,
} as const;

// ============================================
// HELPER TYPES
// ============================================

/**
 * Type für alle Game Limit Konstanten
 */
export type GameLimitConstant = 
  | typeof ROOM_LIMITS[keyof typeof ROOM_LIMITS]
  | typeof HOT_BUTTON_LIMITS[keyof typeof HOT_BUTTON_LIMITS]
  | typeof COLLECTIVE_LIST_LIMITS[keyof typeof COLLECTIVE_LIST_LIMITS]
  | typeof MATCHING[keyof typeof MATCHING]
  | typeof CATEGORY_LIMITS[keyof typeof CATEGORY_LIMITS]
  | typeof RPS_DUEL[keyof typeof RPS_DUEL]
  | typeof DICE_ROYALE[keyof typeof DICE_ROYALE];

