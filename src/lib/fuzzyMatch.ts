/**
 * Fuzzy-Matching Utilities für Bonusrunden
 * 
 * Ermöglicht tolerante Eingabeerkennung bei Tippfehlern
 */

import { distance } from 'fastest-levenshtein';
import { MATCHING } from '@/config/constants';

/**
 * Normalisiert einen String für den Vergleich:
 * - Kleinschreibung
 * - Trimmen
 * - Umlaute vereinheitlichen
 * - Die meisten Sonderzeichen entfernen (aber #, + behalten für C#, C++ etc.)
 */
export function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .trim()
    // Deutsche Umlaute normalisieren
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    // Unicode-Normalisierung (Akzente entfernen)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Alphanumerische Zeichen, Leerzeichen, # und + behalten
    // (wichtig für Programmiersprachen wie C#, C++, F#)
    .replace(/[^a-z0-9\s#+]/g, '')
    // Mehrfache Leerzeichen zusammenfassen
    .replace(/\s+/g, ' ');
}

/**
 * Berechnet die Ähnlichkeit zwischen zwei Strings (0-1)
 * Basiert auf Levenshtein-Distanz
 */
export function similarity(str1: string, str2: string): number {
  const norm1 = normalizeString(str1);
  const norm2 = normalizeString(str2);
  
  if (norm1 === norm2) return 1;
  if (norm1.length === 0 || norm2.length === 0) return 0;
  
  const maxLen = Math.max(norm1.length, norm2.length);
  const dist = distance(norm1, norm2);
  
  return 1 - (dist / maxLen);
}

/**
 * Ergebnis eines Match-Versuchs
 */
export interface MatchResult {
  isMatch: boolean;
  matchedItemId: string | null;
  matchedDisplay: string | null;
  confidence: number;
  matchType: 'exact' | 'alias' | 'fuzzy' | 'none';
  alreadyGuessed: boolean;
}

/**
 * Item-Definition für Collective List
 */
export interface CollectiveListItem {
  id: string;
  display: string;
  aliases: string[];
  group?: string;
}

/**
 * Mindestlänge für Fuzzy-Matching.
 * Bei kürzeren Strings wird nur exakt gematcht, da Fuzzy bei
 * kurzen Strings wie "C", "R", "Go" zu Fehlerkennungen führt.
 */
const MIN_LENGTH_FOR_FUZZY = 4;

/**
 * Prüft ob Fuzzy-Matching für zwei Strings sinnvoll ist.
 * Bei sehr kurzen Strings (wie Programmiersprachen "C", "R", "Go")
 * führt Fuzzy-Matching zu falschen Matches.
 */
function shouldAllowFuzzy(input: string, target: string): boolean {
  const normInput = normalizeString(input);
  const normTarget = normalizeString(target);
  
  // Beide Strings müssen mindestens MIN_LENGTH_FOR_FUZZY Zeichen haben
  // um Fuzzy-Matching zu erlauben
  return normInput.length >= MIN_LENGTH_FOR_FUZZY && 
         normTarget.length >= MIN_LENGTH_FOR_FUZZY;
}

/**
 * Prüft ob eine Eingabe zu einem Item passt
 * Berücksichtigt:
 * 1. Exakte Übereinstimmung mit Display-Name
 * 2. Exakte Übereinstimmung mit Aliases
 * 3. Fuzzy-Match mit Threshold (nur bei Strings >= 4 Zeichen)
 * 
 * WICHTIG: Bei kurzen Strings (< 4 Zeichen) wird nur exakt gematcht,
 * um Verwechslungen wie "C" vs "C#" vs "C++" zu vermeiden.
 */
export function checkAnswer(
  input: string,
  items: CollectiveListItem[],
  alreadyGuessed: Set<string>,
  fuzzyThreshold: number = MATCHING.FUZZY_THRESHOLD
): MatchResult {
  const normalizedInput = normalizeString(input);
  
  if (!normalizedInput) {
    return {
      isMatch: false,
      matchedItemId: null,
      matchedDisplay: null,
      confidence: 0,
      matchType: 'none',
      alreadyGuessed: false,
    };
  }

  // Zuerst exakte Matches prüfen (immer, unabhängig von Länge)
  for (const item of items) {
    // Prüfe Display-Name
    if (normalizeString(item.display) === normalizedInput) {
      return {
        isMatch: !alreadyGuessed.has(item.id),
        matchedItemId: item.id,
        matchedDisplay: item.display,
        confidence: 1,
        matchType: 'exact',
        alreadyGuessed: alreadyGuessed.has(item.id),
      };
    }
    
    // Prüfe alle Aliases
    for (const alias of item.aliases) {
      if (normalizeString(alias) === normalizedInput) {
        return {
          isMatch: !alreadyGuessed.has(item.id),
          matchedItemId: item.id,
          matchedDisplay: item.display,
          confidence: 1,
          matchType: 'alias',
          alreadyGuessed: alreadyGuessed.has(item.id),
        };
      }
    }
  }

  // Dann Fuzzy-Matches prüfen (nur bei ausreichend langen Strings)
  let bestMatch: { item: CollectiveListItem; confidence: number } | null = null;

  for (const item of items) {
    // Prüfe Display-Name mit Fuzzy (nur wenn beide Strings lang genug sind)
    if (shouldAllowFuzzy(input, item.display)) {
      const displaySimilarity = similarity(input, item.display);
      if (displaySimilarity >= fuzzyThreshold) {
        if (!bestMatch || displaySimilarity > bestMatch.confidence) {
          bestMatch = { item, confidence: displaySimilarity };
        }
      }
    }
    
    // Prüfe alle Aliases mit Fuzzy
    for (const alias of item.aliases) {
      if (shouldAllowFuzzy(input, alias)) {
        const aliasSimilarity = similarity(input, alias);
        if (aliasSimilarity >= fuzzyThreshold) {
          if (!bestMatch || aliasSimilarity > bestMatch.confidence) {
            bestMatch = { item, confidence: aliasSimilarity };
          }
        }
      }
    }
  }

  if (bestMatch) {
    return {
      isMatch: !alreadyGuessed.has(bestMatch.item.id),
      matchedItemId: bestMatch.item.id,
      matchedDisplay: bestMatch.item.display,
      confidence: bestMatch.confidence,
      matchType: 'fuzzy',
      alreadyGuessed: alreadyGuessed.has(bestMatch.item.id),
    };
  }

  // Kein Match gefunden
  return {
    isMatch: false,
    matchedItemId: null,
    matchedDisplay: null,
    confidence: 0,
    matchType: 'none',
    alreadyGuessed: false,
  };
}



