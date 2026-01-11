/**
 * Scoring Constants
 * 
 * Alle Punkte-Werte und Scoring-Mechaniken an einem zentralen Ort.
 * Ermöglicht einfaches Balance-Tuning.
 */

// ============================================
// MULTIPLE CHOICE SCORING
// ============================================

/**
 * Punkte-System für Multiple Choice Fragen
 */
export const CHOICE_SCORING = {
  /** Basis-Punkte für richtige Antwort */
  BASE_POINTS: 1000,
  
  /** Divisor für Zeit-Bonus Berechnung (answerTime / DIVISOR) */
  TIME_BONUS_DIVISOR: 100,
  
  /** Punkte pro Streak-Level */
  STREAK_MULTIPLIER: 50,
  
  /** Maximaler Streak-Bonus */
  MAX_STREAK_BONUS: 250,
} as const;

// ============================================
// ESTIMATION SCORING
// ============================================

/**
 * Punkte-System für Schätzfragen
 */
export const ESTIMATION_SCORING = {
  /** Maximale Accuracy-Punkte (bei 0% Abweichung) */
  MAX_ACCURACY_POINTS: 1000,
  
  /** Bonus für perfekte Schätzung (exakt richtig) */
  PERFECT_BONUS: 500,
  
  /** Rank-Bonusse für Top 3 Plätze [1st, 2nd, 3rd] */
  RANK_BONUSES: [300, 200, 100] as const,
  
  /** Basis Rank-Bonus für Plätze 4+ */
  BASE_RANK_BONUS: 50,
  
  /** Maximale Abweichung in Prozent für Punkte (darüber = 0 Punkte) */
  MAX_DEVIATION_PERCENT: 100,
} as const;

// ============================================
// HOT BUTTON SCORING
// ============================================

/**
 * Punkte-System für Hot Button Bonus Round
 */
export const HOT_BUTTON_SCORING = {
  /** Strafpunkte für falsche Antwort */
  WRONG_PENALTY: -500,
  
  /** Maximaler Speed-Bonus */
  MAX_SPEED_BONUS: 500,
  
  /** Speed-Bonus Tiers basierend auf enthülltem Prozentsatz */
  SPEED_TIERS: {
    /** 0-25% enthüllt: +500 Punkte */
    TIER_1: {
      threshold: 0.25,
      bonus: 500,
    },
    /** 25-50% enthüllt: +300 Punkte */
    TIER_2: {
      threshold: 0.50,
      bonus: 300,
    },
    /** 50-75% enthüllt: +150 Punkte */
    TIER_3: {
      threshold: 0.75,
      bonus: 150,
    },
    /** 75-100% enthüllt: +50 Punkte */
    TIER_4: {
      threshold: 1.00,
      bonus: 50,
    },
  },
} as const;

/**
 * Helper: Berechnet Speed-Bonus basierend auf enthülltem Prozentsatz
 * @param revealedPercent Prozentsatz der enthüllten Frage (0.0 - 1.0)
 * @returns Speed-Bonus Punkte
 */
export function calculateHotButtonSpeedBonus(revealedPercent: number): number {
  const { SPEED_TIERS } = HOT_BUTTON_SCORING;
  
  if (revealedPercent <= SPEED_TIERS.TIER_1.threshold) {
    return SPEED_TIERS.TIER_1.bonus;
  } else if (revealedPercent <= SPEED_TIERS.TIER_2.threshold) {
    return SPEED_TIERS.TIER_2.bonus;
  } else if (revealedPercent <= SPEED_TIERS.TIER_3.threshold) {
    return SPEED_TIERS.TIER_3.bonus;
  } else {
    return SPEED_TIERS.TIER_4.bonus;
  }
}

// ============================================
// COLLECTIVE LIST SCORING
// ============================================

/**
 * Punkte-System für Collective List Bonus Round
 */
export const COLLECTIVE_LIST_SCORING = {
  /** Punkte pro richtig erratener Begriff */
  POINTS_PER_CORRECT: 400, // ← Von 200 auf 400 erhöht!
  
  /** Winner-Bonus wenn nur 1 Spieler übrig (Solo-Winner) */
  WINNER_BONUS_SOLO: 500,
  
  /** Winner-Bonus wenn mehrere Spieler übrig (Multi-Winner) */
  WINNER_BONUS_MULTI: 250,
} as const;

// ============================================
// HELPER TYPES
// ============================================

/**
 * Type für alle Scoring-Konstanten
 */
export type ScoringConstant = 
  | typeof CHOICE_SCORING[keyof typeof CHOICE_SCORING]
  | typeof ESTIMATION_SCORING[keyof typeof ESTIMATION_SCORING]
  | typeof HOT_BUTTON_SCORING[keyof typeof HOT_BUTTON_SCORING]
  | typeof COLLECTIVE_LIST_SCORING[keyof typeof COLLECTIVE_LIST_SCORING];

