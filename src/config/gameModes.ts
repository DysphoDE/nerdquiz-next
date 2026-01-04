/**
 * Game Mode Configuration - Client-seitig mit Icons
 * 
 * Erweitert die shared Config um Lucide Icons für UI-Komponenten.
 * Für Server-Code: Importiere gameModes.shared.ts
 */

import { 
  Vote, 
  CircleDot, 
  Crown, 
  Dices, 
  Swords,
  ListChecks,
  Zap,
  ArrowUpDown,
  Type,
  Link2,
  LucideIcon,
} from 'lucide-react';

// Re-export alles aus shared (inkl. CategorySelectionMode, BonusRoundType)
export * from './gameModes.shared';

import {
  CATEGORY_SELECTION_MODES_DATA,
  BONUS_ROUND_TYPES_DATA,
  type CategorySelectionModeData,
  type BonusRoundTypeData,
} from './gameModes.shared';

// ============================================
// ICON MAPPINGS
// ============================================

const CATEGORY_MODE_ICONS: Record<string, LucideIcon> = {
  voting: Vote,
  wheel: CircleDot,
  losers_pick: Crown,
  dice_royale: Dices,
  rps_duel: Swords,
};

const BONUS_TYPE_ICONS: Record<string, LucideIcon> = {
  collective_list: ListChecks,
  hot_button: Zap,
  sorting: ArrowUpDown,
  text_input: Type,
  matching: Link2,
};

// ============================================
// EXTENDED TYPES WITH ICONS
// ============================================

export interface CategorySelectionModeConfig extends CategorySelectionModeData {
  icon: LucideIcon;
}

export interface BonusRoundTypeConfig extends BonusRoundTypeData {
  icon: LucideIcon;
}

// ============================================
// EXTENDED DATA WITH ICONS
// ============================================

/**
 * Kategorie-Auswahlmethoden mit Icons
 */
export const CATEGORY_SELECTION_MODES: CategorySelectionModeConfig[] = 
  CATEGORY_SELECTION_MODES_DATA.map(mode => ({
    ...mode,
    icon: CATEGORY_MODE_ICONS[mode.id] || Vote,
  }));

/**
 * Bonusrunden-Typen mit Icons
 */
export const BONUS_ROUND_TYPES: BonusRoundTypeConfig[] = 
  BONUS_ROUND_TYPES_DATA.map(type => ({
    ...type,
    icon: BONUS_TYPE_ICONS[type.id] || ListChecks,
  }));

/**
 * Lookup-Maps
 */
export const CATEGORY_MODE_MAP = new Map(
  CATEGORY_SELECTION_MODES.map(mode => [mode.id, mode])
);

export const BONUS_TYPE_MAP = new Map(
  BONUS_ROUND_TYPES.map(type => [type.id, type])
);

/**
 * Nur implementierte Bonusrunden-Typen
 */
export const IMPLEMENTED_BONUS_TYPES = BONUS_ROUND_TYPES.filter(t => t.isImplemented);

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Holt die Konfiguration für einen Kategorie-Modus
 */
export function getCategoryModeConfig(modeId: string): CategorySelectionModeConfig | undefined {
  return CATEGORY_MODE_MAP.get(modeId);
}

/**
 * Holt die Konfiguration für einen Bonusrunden-Typ
 */
export function getBonusTypeConfig(typeId: string): BonusRoundTypeConfig | undefined {
  return BONUS_TYPE_MAP.get(typeId);
}

// ============================================
// ROULETTE HELPERS
// ============================================

export interface RouletteItem {
  id: string;
  name: string;
  emoji: string;
  color: string;
  description: string;
}

/**
 * Konvertiert Kategorie-Modi zu Roulette-Items
 */
export function getCategoryModesForRoulette(): RouletteItem[] {
  return CATEGORY_SELECTION_MODES.map(mode => ({
    id: mode.id,
    name: mode.name,
    emoji: mode.emoji,
    color: mode.color,
    description: mode.description,
  }));
}

/**
 * Konvertiert Bonusrunden-Typen zu Roulette-Items
 * @param onlyImplemented - Wenn true, nur implementierte Typen
 * @param showComingSoon - Wenn true, zeige auch nicht-implementierte (für visuellen Flair)
 */
export function getBonusTypesForRoulette(
  onlyImplemented: boolean = true,
  showComingSoon: boolean = false
): RouletteItem[] {
  const types = onlyImplemented 
    ? IMPLEMENTED_BONUS_TYPES 
    : (showComingSoon ? BONUS_ROUND_TYPES : IMPLEMENTED_BONUS_TYPES);
    
  return types.map(type => ({
    id: type.id,
    name: type.name,
    emoji: type.emoji,
    color: type.color,
    description: type.description,
  }));
}
