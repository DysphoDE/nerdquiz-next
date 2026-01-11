/**
 * Constants Index
 * 
 * Zentraler Export-Punkt für alle Game Constants.
 * Importiere von hier aus für einfachen Zugriff:
 * 
 * @example
 * import { UI_TIMING, CHOICE_SCORING, ROOM_LIMITS } from '@/config/constants';
 */

// ============================================
// TIMING CONSTANTS
// ============================================

export {
  UI_TIMING,
  GAME_TIMERS,
  HOT_BUTTON_TIMING,
  COLLECTIVE_LIST_TIMING,
  type TimingConstant,
} from './timing';

// ============================================
// SCORING CONSTANTS
// ============================================

export {
  CHOICE_SCORING,
  ESTIMATION_SCORING,
  HOT_BUTTON_SCORING,
  COLLECTIVE_LIST_SCORING,
  calculateHotButtonSpeedBonus,
  type ScoringConstant,
} from './scoring';

// ============================================
// GAME LIMITS
// ============================================

export {
  ROOM_LIMITS,
  HOT_BUTTON_LIMITS,
  COLLECTIVE_LIST_LIMITS,
  MATCHING,
  CATEGORY_LIMITS,
  RPS_DUEL,
  DICE_ROYALE,
  type GameLimitConstant,
} from './gameLimits';

// ============================================
// VALIDATION CONSTANTS
// ============================================

export {
  PLAYER_VALIDATION,
  ROOM_VALIDATION,
  SETTINGS_VALIDATION,
  ANSWER_VALIDATION,
  AVATAR_VALIDATION,
  DEV_MODE_VALIDATION,
  VALIDATION_ERRORS,
  type ValidationConstant,
  type ValidationError,
} from './validation';

// ============================================
// THRESHOLDS
// ============================================

export {
  ESTIMATION_THRESHOLDS,
  HOT_BUTTON_SPEED_THRESHOLDS,
  ACCURACY_THRESHOLDS,
  PARTICIPATION_THRESHOLDS,
  BONUS_ROUND_THRESHOLDS,
  getAccuracyLevel,
  getEstimationQuality,
  type ThresholdConstant,
  type AccuracyLevel,
  type EstimationQuality,
} from './thresholds';

// ============================================
// CONVENIENCE RE-EXPORTS
// ============================================

import {
  UI_TIMING as _UI_TIMING,
  GAME_TIMERS as _GAME_TIMERS,
  HOT_BUTTON_TIMING as _HOT_BUTTON_TIMING,
  COLLECTIVE_LIST_TIMING as _COLLECTIVE_LIST_TIMING,
} from './timing';

import {
  CHOICE_SCORING as _CHOICE_SCORING,
  ESTIMATION_SCORING as _ESTIMATION_SCORING,
  HOT_BUTTON_SCORING as _HOT_BUTTON_SCORING,
  COLLECTIVE_LIST_SCORING as _COLLECTIVE_LIST_SCORING,
} from './scoring';

import {
  ROOM_LIMITS as _ROOM_LIMITS,
  HOT_BUTTON_LIMITS as _HOT_BUTTON_LIMITS,
  COLLECTIVE_LIST_LIMITS as _COLLECTIVE_LIST_LIMITS,
  MATCHING as _MATCHING,
  CATEGORY_LIMITS as _CATEGORY_LIMITS,
  RPS_DUEL as _RPS_DUEL,
  DICE_ROYALE as _DICE_ROYALE,
} from './gameLimits';

import {
  PLAYER_VALIDATION as _PLAYER_VALIDATION,
  ROOM_VALIDATION as _ROOM_VALIDATION,
  SETTINGS_VALIDATION as _SETTINGS_VALIDATION,
  ANSWER_VALIDATION as _ANSWER_VALIDATION,
  AVATAR_VALIDATION as _AVATAR_VALIDATION,
  DEV_MODE_VALIDATION as _DEV_MODE_VALIDATION,
  VALIDATION_ERRORS as _VALIDATION_ERRORS,
} from './validation';

import {
  ESTIMATION_THRESHOLDS as _ESTIMATION_THRESHOLDS,
  HOT_BUTTON_SPEED_THRESHOLDS as _HOT_BUTTON_SPEED_THRESHOLDS,
  ACCURACY_THRESHOLDS as _ACCURACY_THRESHOLDS,
  PARTICIPATION_THRESHOLDS as _PARTICIPATION_THRESHOLDS,
  BONUS_ROUND_THRESHOLDS as _BONUS_ROUND_THRESHOLDS,
} from './thresholds';

/**
 * Alle Timing-Konstanten in einem Objekt
 */
export const TIMING = {
  UI: _UI_TIMING,
  GAME: _GAME_TIMERS,
  HOT_BUTTON: _HOT_BUTTON_TIMING,
  COLLECTIVE_LIST: _COLLECTIVE_LIST_TIMING,
} as const;

/**
 * Alle Scoring-Konstanten in einem Objekt
 */
export const SCORING = {
  CHOICE: _CHOICE_SCORING,
  ESTIMATION: _ESTIMATION_SCORING,
  HOT_BUTTON: _HOT_BUTTON_SCORING,
  COLLECTIVE_LIST: _COLLECTIVE_LIST_SCORING,
} as const;

/**
 * Alle Limits in einem Objekt
 */
export const LIMITS = {
  ROOM: _ROOM_LIMITS,
  HOT_BUTTON: _HOT_BUTTON_LIMITS,
  COLLECTIVE_LIST: _COLLECTIVE_LIST_LIMITS,
  CATEGORY: _CATEGORY_LIMITS,
  RPS: _RPS_DUEL,
  DICE: _DICE_ROYALE,
  MATCHING: _MATCHING,
} as const;

/**
 * Alle Validierungs-Konstanten in einem Objekt
 */
export const VALIDATION = {
  PLAYER: _PLAYER_VALIDATION,
  ROOM: _ROOM_VALIDATION,
  SETTINGS: _SETTINGS_VALIDATION,
  ANSWER: _ANSWER_VALIDATION,
  AVATAR: _AVATAR_VALIDATION,
  DEV_MODE: _DEV_MODE_VALIDATION,
  ERRORS: _VALIDATION_ERRORS,
} as const;

/**
 * Alle Thresholds in einem Objekt
 */
export const THRESHOLDS = {
  ESTIMATION: _ESTIMATION_THRESHOLDS,
  HOT_BUTTON_SPEED: _HOT_BUTTON_SPEED_THRESHOLDS,
  ACCURACY: _ACCURACY_THRESHOLDS,
  PARTICIPATION: _PARTICIPATION_THRESHOLDS,
  BONUS_ROUND: _BONUS_ROUND_THRESHOLDS,
} as const;

