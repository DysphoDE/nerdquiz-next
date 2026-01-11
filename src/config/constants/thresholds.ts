/**
 * Thresholds Constants
 * 
 * Prozent-basierte Schwellenwerte und Grenzwerte für verschiedene Spielmechaniken.
 */

// ============================================
// ESTIMATION THRESHOLDS
// ============================================

/**
 * Schwellenwerte für Schätzfragen
 */
export const ESTIMATION_THRESHOLDS = {
  /** Maximale Abweichung in Prozent für Punkte (darüber = 0 Punkte) */
  MAX_DEVIATION_PERCENT: 100,
  
  /** Sehr gute Schätzung (< 5% Abweichung) */
  EXCELLENT_THRESHOLD: 5,
  
  /** Gute Schätzung (< 10% Abweichung) */
  GOOD_THRESHOLD: 10,
  
  /** Akzeptable Schätzung (< 25% Abweichung) */
  ACCEPTABLE_THRESHOLD: 25,
} as const;

// ============================================
// HOT BUTTON SPEED THRESHOLDS
// ============================================

/**
 * Schwellenwerte für Hot Button Speed-Bonus
 * (Prozentsatz der enthüllten Frage)
 */
export const HOT_BUTTON_SPEED_THRESHOLDS = {
  /** Tier 1: 0-25% enthüllt (höchster Bonus) */
  TIER_1_PERCENT: 25,
  
  /** Tier 2: 25-50% enthüllt */
  TIER_2_PERCENT: 50,
  
  /** Tier 3: 50-75% enthüllt */
  TIER_3_PERCENT: 75,
  
  /** Tier 4: 75-100% enthüllt (niedrigster Bonus) */
  TIER_4_PERCENT: 100,
} as const;

// ============================================
// ACCURACY THRESHOLDS
// ============================================

/**
 * Allgemeine Genauigkeits-Schwellenwerte
 */
export const ACCURACY_THRESHOLDS = {
  /** Perfekte Genauigkeit (100%) */
  PERFECT: 100,
  
  /** Sehr gut (>= 90%) */
  EXCELLENT: 90,
  
  /** Gut (>= 75%) */
  GOOD: 75,
  
  /** Durchschnittlich (>= 50%) */
  AVERAGE: 50,
  
  /** Schwach (< 50%) */
  POOR: 50,
} as const;

// ============================================
// PARTICIPATION THRESHOLDS
// ============================================

/**
 * Schwellenwerte für Teilnahme und Aktivität
 */
export const PARTICIPATION_THRESHOLDS = {
  /** Mindest-Teilnahme für Statistiken (Anzahl Fragen) */
  MIN_QUESTIONS_FOR_STATS: 3,
  
  /** Mindest-Antworten für "Fastest Finger" Award */
  MIN_ANSWERS_FOR_SPEED_AWARD: 5,
  
  /** Mindest-Schätzfragen für "Best Estimator" Award */
  MIN_ESTIMATIONS_FOR_AWARD: 3,
} as const;

// ============================================
// BONUS ROUND THRESHOLDS
// ============================================

/**
 * Schwellenwerte für Bonus Rounds
 */
export const BONUS_ROUND_THRESHOLDS = {
  /** Mindest-Prozentsatz gefundener Items für "Gut gemacht" (Collective List) */
  COLLECTIVE_LIST_GOOD_COMPLETION: 50,
  
  /** Mindest-Prozentsatz für "Sehr gut" */
  COLLECTIVE_LIST_EXCELLENT_COMPLETION: 75,
  
  /** Perfekte Completion */
  COLLECTIVE_LIST_PERFECT_COMPLETION: 100,
} as const;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Bestimmt Accuracy-Level basierend auf Prozentsatz
 */
export function getAccuracyLevel(accuracyPercent: number): 'perfect' | 'excellent' | 'good' | 'average' | 'poor' {
  if (accuracyPercent >= ACCURACY_THRESHOLDS.PERFECT) return 'perfect';
  if (accuracyPercent >= ACCURACY_THRESHOLDS.EXCELLENT) return 'excellent';
  if (accuracyPercent >= ACCURACY_THRESHOLDS.GOOD) return 'good';
  if (accuracyPercent >= ACCURACY_THRESHOLDS.AVERAGE) return 'average';
  return 'poor';
}

/**
 * Bestimmt Estimation-Qualität basierend auf Abweichung
 */
export function getEstimationQuality(deviationPercent: number): 'excellent' | 'good' | 'acceptable' | 'poor' {
  if (deviationPercent < ESTIMATION_THRESHOLDS.EXCELLENT_THRESHOLD) return 'excellent';
  if (deviationPercent < ESTIMATION_THRESHOLDS.GOOD_THRESHOLD) return 'good';
  if (deviationPercent < ESTIMATION_THRESHOLDS.ACCEPTABLE_THRESHOLD) return 'acceptable';
  return 'poor';
}

// ============================================
// HELPER TYPES
// ============================================

/**
 * Type für alle Threshold-Konstanten
 */
export type ThresholdConstant = 
  | typeof ESTIMATION_THRESHOLDS[keyof typeof ESTIMATION_THRESHOLDS]
  | typeof HOT_BUTTON_SPEED_THRESHOLDS[keyof typeof HOT_BUTTON_SPEED_THRESHOLDS]
  | typeof ACCURACY_THRESHOLDS[keyof typeof ACCURACY_THRESHOLDS]
  | typeof PARTICIPATION_THRESHOLDS[keyof typeof PARTICIPATION_THRESHOLDS]
  | typeof BONUS_ROUND_THRESHOLDS[keyof typeof BONUS_ROUND_THRESHOLDS];

/**
 * Accuracy Level Type
 */
export type AccuracyLevel = ReturnType<typeof getAccuracyLevel>;

/**
 * Estimation Quality Type
 */
export type EstimationQuality = ReturnType<typeof getEstimationQuality>;

