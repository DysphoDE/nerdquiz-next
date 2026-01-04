/**
 * Shared Game Mode Configuration
 * 
 * Diese Datei enthält die DATEN für Spielmodi - ohne UI-Dependencies wie Icons.
 * Kann sowohl im Server als auch im Client verwendet werden.
 * 
 * Für UI-Komponenten: Importiere stattdessen gameModes.ts (hat Icons)
 */

// ============================================
// TYPE DEFINITIONS
// ============================================

/**
 * Alle verfügbaren Kategorie-Auswahlmethoden IDs
 * Diese werden aus den Daten abgeleitet für Type-Safety
 */
export const CATEGORY_MODE_IDS = ['voting', 'wheel', 'losers_pick', 'dice_royale', 'rps_duel'] as const;
export type CategorySelectionMode = typeof CATEGORY_MODE_IDS[number];

/**
 * Alle verfügbaren Bonusrunden-Typ IDs
 */
export const BONUS_TYPE_IDS = ['collective_list', 'hot_button', 'sorting', 'text_input', 'matching'] as const;
export type BonusRoundType = typeof BONUS_TYPE_IDS[number];

// ============================================
// KATEGORIE-AUSWAHLMETHODEN
// ============================================

export interface CategorySelectionModeData {
  id: string;
  name: string;
  emoji: string;
  color: string; // Tailwind gradient classes
  description: string;
  minPlayers: number;
  /** Basis-Wahrscheinlichkeit in % (vor Anpassungen) */
  weight: number;
  /** Cooldown in Runden (0 = kein Cooldown) */
  cooldownRounds: number;
}

/**
 * Alle verfügbaren Methoden zur Kategorie-Auswahl
 */
export const CATEGORY_SELECTION_MODES_DATA: CategorySelectionModeData[] = [
  {
    id: 'voting',
    name: 'Abstimmung',
    emoji: '🗳️',
    color: 'from-blue-500 to-cyan-500',
    description: 'Alle Spieler stimmen ab, die Mehrheit gewinnt!',
    minPlayers: 1,
    weight: 25,
    cooldownRounds: 0,
  },
  {
    id: 'wheel',
    name: 'Glücksrad',
    emoji: '🎡',
    color: 'from-purple-500 to-pink-500',
    description: 'Das Schicksal entscheidet per Glücksrad!',
    minPlayers: 1,
    weight: 25,
    cooldownRounds: 0,
  },
  {
    id: 'losers_pick',
    name: "Loser's Pick",
    emoji: '👑',
    color: 'from-amber-500 to-orange-500',
    description: 'Der Letztplatzierte darf die Kategorie wählen!',
    minPlayers: 2,
    weight: 15,
    cooldownRounds: 2, // Nicht zwei Runden hintereinander
  },
  {
    id: 'dice_royale',
    name: 'Dice Royale',
    emoji: '🎲',
    color: 'from-emerald-500 to-teal-500',
    description: 'Alle würfeln - wer am höchsten würfelt, wählt!',
    minPlayers: 2,
    weight: 20,
    cooldownRounds: 0,
  },
  {
    id: 'rps_duel',
    name: 'Schere Stein Papier',
    emoji: '✊',
    color: 'from-red-500 to-rose-500',
    description: 'Zwei Spieler duellieren sich - der Sieger wählt!',
    minPlayers: 2,
    weight: 15,
    cooldownRounds: 0,
  },
];

/**
 * Lookup-Map für schnellen Zugriff per ID
 */
export const CATEGORY_MODE_DATA_MAP = new Map(
  CATEGORY_SELECTION_MODES_DATA.map(mode => [mode.id, mode])
);

// ============================================
// BONUSRUNDEN-TYPEN
// ============================================

export interface BonusRoundTypeData {
  id: string;
  name: string;
  emoji: string;
  color: string;
  description: string;
  /** Entsprechender QuestionType in der DB */
  questionType: string;
  /** Ist dieser Typ bereits implementiert? */
  isImplemented: boolean;
}

/**
 * Alle Bonusrunden-Typen
 */
export const BONUS_ROUND_TYPES_DATA: BonusRoundTypeData[] = [
  {
    id: 'collective_list',
    name: 'Listen-Runde',
    emoji: '📝',
    color: 'from-amber-500 to-yellow-500',
    description: 'Nennt nacheinander alle Begriffe einer Liste!',
    questionType: 'COLLECTIVE_LIST',
    isImplemented: true,
  },
  {
    id: 'hot_button',
    name: 'Hot Button',
    emoji: '⚡',
    color: 'from-yellow-500 to-orange-500',
    description: 'Buzzere und beantworte die Frage so schnell wie möglich!',
    questionType: 'HOT_BUTTON',
    isImplemented: true,
  },
  {
    id: 'sorting',
    name: 'Sortier-Runde',
    emoji: '🔢',
    color: 'from-violet-500 to-purple-500',
    description: 'Bringt die Elemente in die richtige Reihenfolge!',
    questionType: 'SORTING',
    isImplemented: false,
  },
  {
    id: 'text_input',
    name: 'Bildrätsel',
    emoji: '🖼️',
    color: 'from-pink-500 to-rose-500',
    description: 'Erkennt was auf dem Bild zu sehen ist!',
    questionType: 'TEXT_INPUT',
    isImplemented: false,
  },
  {
    id: 'matching',
    name: 'Zuordnung',
    emoji: '🔗',
    color: 'from-cyan-500 to-blue-500',
    description: 'Ordnet die Paare richtig einander zu!',
    questionType: 'MATCHING',
    isImplemented: false,
  },
];

/**
 * Lookup-Map für schnellen Zugriff per ID
 */
export const BONUS_TYPE_DATA_MAP = new Map(
  BONUS_ROUND_TYPES_DATA.map(type => [type.id, type])
);

/**
 * Nur die implementierten Bonusrunden-Typen
 */
export const IMPLEMENTED_BONUS_TYPES_DATA = BONUS_ROUND_TYPES_DATA.filter(t => t.isImplemented);

// ============================================
// HELPER FUNKTIONEN
// ============================================

/**
 * Wählt einen zufälligen Kategorie-Modus basierend auf Spielerzahl und Cooldowns
 * 
 * @param playerCount - Anzahl verbundener Spieler
 * @param lastModeRounds - Map von mode.id zu Rundenzahl seit letzter Nutzung
 * @param currentRound - Aktuelle Rundenzahl
 */
export function selectRandomCategoryMode(
  playerCount: number,
  lastModeRounds: Map<string, number>,
  currentRound: number
): CategorySelectionModeData {
  // Filter nach verfügbaren Modi
  const availableModes = CATEGORY_SELECTION_MODES_DATA.filter(mode => {
    // Genug Spieler?
    if (playerCount < mode.minPlayers) return false;
    
    // Loser's Pick: Nicht in Runde 1 (es gibt noch keinen Loser mit unterschiedlichem Score)
    if (mode.id === 'losers_pick' && currentRound <= 1) return false;
    
    // Cooldown erfüllt?
    if (mode.cooldownRounds > 0) {
      const lastUsedRound = lastModeRounds.get(mode.id);
      if (lastUsedRound !== undefined) {
        const roundsSince = currentRound - lastUsedRound;
        if (roundsSince < mode.cooldownRounds) return false;
      }
    }
    
    return true;
  });

  // Fallback: Wenn keine Modi verfügbar, nimm voting
  if (availableModes.length === 0) {
    return CATEGORY_SELECTION_MODES_DATA[0]; // voting
  }

  // Gewichtete Zufallsauswahl
  const totalWeight = availableModes.reduce((sum, mode) => sum + mode.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const mode of availableModes) {
    random -= mode.weight;
    if (random <= 0) {
      return mode;
    }
  }

  // Fallback (sollte nie passieren)
  return availableModes[0];
}

/**
 * Findet den Bonusrunden-Typ anhand des QuestionType aus der DB
 */
export function getBonusTypeDataByQuestionType(questionType: string): BonusRoundTypeData | undefined {
  return BONUS_ROUND_TYPES_DATA.find(t => t.questionType === questionType);
}

