/**
 * Validation Constants
 * 
 * Alle Validierungs-Limits und Constraints für Input-Validierung.
 * Verwendet von Zod-Schemas und Server-Validierung.
 */

// ============================================
// PLAYER VALIDATION
// ============================================

/**
 * Validierungs-Limits für Spieler-Daten
 */
export const PLAYER_VALIDATION = {
  /** Minimale Länge für Spieler-Namen */
  NAME_MIN_LENGTH: 1,
  
  /** Maximale Länge für Spieler-Namen */
  NAME_MAX_LENGTH: 16,
  
  /** Player-ID Prefix */
  ID_PREFIX: 'p_',
  
  /** Minimale Player-ID Länge (ohne Prefix) */
  ID_MIN_LENGTH: 3,
  
  /** Player-ID Format Regex */
  ID_REGEX: /^p_[a-z0-9]+$/,
} as const;

// ============================================
// ROOM VALIDATION
// ============================================

/**
 * Validierungs-Limits für Raum-Daten
 */
export const ROOM_VALIDATION = {
  /** Room-Code Länge */
  CODE_LENGTH: 4,
  
  /** Room-Code Format Regex (nur erlaubte Zeichen) */
  CODE_REGEX: /^[A-Z2-9]+$/,
  
  /** Erlaubte Zeichen für Room-Codes */
  CODE_CHARS: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
} as const;

// ============================================
// GAME SETTINGS VALIDATION
// ============================================

/**
 * Validierungs-Limits für Spiel-Einstellungen
 */
export const SETTINGS_VALIDATION = {
  // Rounds
  /** Minimale Anzahl Runden */
  ROUNDS_MIN: 1,
  /** Maximale Anzahl Runden */
  ROUNDS_MAX: 20,
  
  // Questions per Round
  /** Minimale Fragen pro Runde */
  QUESTIONS_PER_ROUND_MIN: 1,
  /** Maximale Fragen pro Runde */
  QUESTIONS_PER_ROUND_MAX: 20,
  
  // Time per Question
  /** Minimale Zeit pro Frage (Sekunden) */
  TIME_PER_QUESTION_MIN: 5,
  /** Maximale Zeit pro Frage (Sekunden) */
  TIME_PER_QUESTION_MAX: 60,
  
  // Bonus Round Chance
  /** Minimale Bonusrunden-Chance (%) */
  BONUS_CHANCE_MIN: 0,
  /** Maximale Bonusrunden-Chance (%) */
  BONUS_CHANCE_MAX: 100,
  
  // Hot Button Questions
  /** Minimale Hot Button Fragen pro Runde */
  HOT_BUTTON_QUESTIONS_MIN: 1,
  /** Maximale Hot Button Fragen pro Runde */
  HOT_BUTTON_QUESTIONS_MAX: 10,
} as const;

// ============================================
// ANSWER VALIDATION
// ============================================

/**
 * Validierungs-Limits für Antworten
 */
export const ANSWER_VALIDATION = {
  /** Minimaler Answer-Index (0-basiert) */
  ANSWER_INDEX_MIN: 0,
  
  /** Maximaler Answer-Index */
  ANSWER_INDEX_MAX: 9,
  
  /** Minimale Estimation Value */
  ESTIMATION_MIN: -1000000000,
  
  /** Maximale Estimation Value */
  ESTIMATION_MAX: 1000000000,
  
  /** Maximale Länge für Text-Antworten (Bonus Rounds) */
  TEXT_ANSWER_MAX_LENGTH: 200,
} as const;

// ============================================
// AVATAR VALIDATION
// ============================================

/**
 * Validierungs-Limits für Avatar-Optionen
 */
export const AVATAR_VALIDATION = {
  /** Maximale Länge für Avatar-Options String */
  OPTIONS_MAX_LENGTH: 500,
} as const;

// ============================================
// DEV MODE VALIDATION
// ============================================

/**
 * Validierungs-Limits für Dev-Mode
 */
export const DEV_MODE_VALIDATION = {
  /** Maximale Länge für Secret Code */
  SECRET_CODE_MAX_LENGTH: 100,
  
  /** Maximale Länge für Dev-Command */
  COMMAND_MAX_LENGTH: 50,
} as const;

// ============================================
// ERROR MESSAGES
// ============================================

/**
 * Standard-Fehlermeldungen für Validierung
 */
export const VALIDATION_ERRORS = {
  // Player
  PLAYER_NAME_EMPTY: 'Name darf nicht leer sein',
  PLAYER_NAME_TOO_LONG: 'Name zu lang (max. 16 Zeichen)',
  PLAYER_ID_INVALID: 'Ungültiges Player-ID Format',
  
  // Room
  ROOM_CODE_INVALID_LENGTH: 'Room-Code muss 4 Zeichen haben',
  ROOM_CODE_INVALID_CHARS: 'Ungültiger Room-Code',
  ROOM_NOT_FOUND: 'Raum nicht gefunden',
  ROOM_FULL: 'Raum ist voll',
  ROOM_GAME_RUNNING: 'Spiel läuft bereits',
  
  // Settings
  SETTINGS_INVALID_ROUNDS: 'Ungültige Anzahl Runden (1-20)',
  SETTINGS_INVALID_QUESTIONS: 'Ungültige Anzahl Fragen (1-20)',
  SETTINGS_INVALID_TIME: 'Ungültige Zeit pro Frage (5-60s)',
  
  // General
  INVALID_INPUT: 'Ungültige Eingabe',
  MISSING_REQUIRED_FIELD: 'Pflichtfeld fehlt',
} as const;

// ============================================
// HELPER TYPES
// ============================================

/**
 * Type für alle Validierungs-Konstanten
 */
export type ValidationConstant = 
  | typeof PLAYER_VALIDATION[keyof typeof PLAYER_VALIDATION]
  | typeof ROOM_VALIDATION[keyof typeof ROOM_VALIDATION]
  | typeof SETTINGS_VALIDATION[keyof typeof SETTINGS_VALIDATION]
  | typeof ANSWER_VALIDATION[keyof typeof ANSWER_VALIDATION]
  | typeof AVATAR_VALIDATION[keyof typeof AVATAR_VALIDATION]
  | typeof DEV_MODE_VALIDATION[keyof typeof DEV_MODE_VALIDATION];

/**
 * Type für Fehler-Meldungen
 */
export type ValidationError = typeof VALIDATION_ERRORS[keyof typeof VALIDATION_ERRORS];

