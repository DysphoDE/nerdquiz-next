/**
 * Timing Constants
 * 
 * Alle Zeitwerte (Delays, Timeouts, Animationen) an einem zentralen Ort.
 * Werte sind in Millisekunden, außer anders angegeben.
 */

// ============================================
// UI TRANSITIONS & ANIMATIONS
// ============================================

/**
 * Standard UI-Übergänge und Animationen
 */
export const UI_TIMING = {
  /** Kurze UI-Updates (500ms) */
  SHORT_DELAY: 500,
  
  /** Mittlere Animationen (1500ms) */
  MEDIUM_DELAY: 1500,
  
  /** Standard-Übergänge (2000ms) */
  STANDARD_TRANSITION: 2000,
  
  /** Längere Übergänge (2500ms) */
  LONG_TRANSITION: 2500,
  
  /** Roulette-Animation Dauer (3000ms) */
  ROULETTE_ANIMATION: 3000,
  
  /** Glücksrad Animation Dauer (5500ms) */
  WHEEL_ANIMATION: 5500,
  
  /** Ergebnis-Anzeige Dauer (4000ms) */
  RESULT_DISPLAY: 4000,
  
  /** Finale Statistiken Anzeige (8000ms) */
  FINAL_RESULTS: 8000,
  
  /** Zeit zum Lesen von Intro/Regeln (6000ms) */
  INTRO_READING_TIME: 6000,
  
  /** Kategorie-Ankündigung Dauer (2500ms) */
  CATEGORY_ANNOUNCEMENT: 2500,
} as const;

// ============================================
// GAME TIMERS (Player Actions)
// ============================================

/**
 * Timer für Spieler-Aktionen
 */
export const GAME_TIMERS = {
  /** Zeit für Kategorie-Voting (15s) */
  CATEGORY_VOTING: 15000,
  
  /** Zeit für Loser's Pick (15s) */
  LOSERS_PICK: 15000,
  
  /** Zeit für Dice Royale Winner Pick (15s) */
  DICE_ROYALE_PICK: 15000,
  
  /** Zeit für RPS Duel Winner Pick (15s) */
  RPS_DUEL_PICK: 15000,
  
  /** Zeit pro RPS Runde (10s) */
  RPS_ROUND: 10000,
  
  /** Zeit für Rematch-Voting (20s) */
  REMATCH_VOTING: 20000,
  
  /** Zeit für alle Dice Royale Würfe (15.5s) */
  DICE_ROYALE_ROLLING: 15500,
  
  /** Zeit für Dice Royale Re-Roll (10s) */
  DICE_ROYALE_REROLL: 10000,
  
  /** Zeit bis leerer Room gelöscht wird (60s) */
  EMPTY_ROOM_CLEANUP: 60000,
} as const;

// ============================================
// BONUS ROUND TIMERS
// ============================================

/**
 * Hot Button Bonus Round Timings
 */
export const HOT_BUTTON_TIMING = {
  /** Intro-Dauer (6s) */
  INTRO: 6000,
  
  /** Buzzer-Zeit (25s) */
  BUZZER_TIMEOUT: 25000,
  
  /** Antwort-Zeit nach Buzz (15s) */
  ANSWER_TIMEOUT: 15000,
  
  /** Zeichen-Enthüllungs-Geschwindigkeit (50ms pro Zeichen) */
  REVEAL_SPEED: 50,
  
  /** Ergebnis-Anzeige nach Antwort (4s) */
  RESULT_DISPLAY: 4000,
  
  /** Delay nach falscher Antwort für Rebuzz (2.5s) */
  REBUZZ_DELAY: 2500,
  
  /** Delay nach Timeout für Rebuzz (2s) */
  TIMEOUT_REBUZZ_DELAY: 2000,
  
  /** Finale Auswertung (8s) */
  FINAL_RESULTS: 8000,
} as const;

/**
 * Collective List Bonus Round Timings
 */
export const COLLECTIVE_LIST_TIMING = {
  /** Intro-Dauer (3s) */
  INTRO: 3000,
  
  /** Zeit pro Spieler-Zug (15s) */
  TURN_DURATION: 15000,
  
  /** Phase 1: "NAME sagt:" erscheint (600ms) */
  REVEAL_PHASE_1: 600,
  
  /** Phase 2: Begriff wird gezeigt (800ms) */
  REVEAL_PHASE_2: 800,
  
  /** Phase 3: Auflösung richtig/falsch (1200ms) */
  REVEAL_PHASE_3: 1200,
  
  /** Gesamt-Delay für Antwort-Feedback (Phase 1 + 2 + 3 = 2600ms) */
  FEEDBACK_TOTAL_DELAY: 2600,
  
  /** Delay nach richtiger Antwort (Feedback + kleiner Buffer) */
  CORRECT_ANSWER_DELAY: 2800,
  
  /** Delay nach Elimination (Feedback + kleiner Buffer) */
  ELIMINATION_DELAY: 2800,
  
  /** Finale Auswertung (8s) */
  FINAL_RESULTS: 8000,
} as const;

// ============================================
// HELPER TYPE
// ============================================

/**
 * Type-safe access to all timing constants
 */
export type TimingConstant = 
  | typeof UI_TIMING[keyof typeof UI_TIMING]
  | typeof GAME_TIMERS[keyof typeof GAME_TIMERS]
  | typeof HOT_BUTTON_TIMING[keyof typeof HOT_BUTTON_TIMING]
  | typeof COLLECTIVE_LIST_TIMING[keyof typeof COLLECTIVE_LIST_TIMING];

