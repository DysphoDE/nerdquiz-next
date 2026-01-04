'use client';

import { useGameStore } from '@/store/gameStore';
import { CollectiveListGame } from './bonus-rounds/CollectiveListGame';
import { HotButtonGame } from './bonus-rounds/HotButtonGame';
import type { BonusRoundState } from '@/types/game';

/**
 * BonusRoundScreen - Router für verschiedene Bonusrunden-Spieltypen
 * 
 * Entscheidet basierend auf dem Typ welcher Spieltyp angezeigt wird.
 * Aktuell unterstützt:
 * - "collective_list" → CollectiveListGame
 * - "hot_button" → HotButtonGame
 * 
 * Zukünftig geplant:
 * - "sorting" → SortingGame
 * - "matching" → MatchingGame
 * - "text_input" → TextInputGame
 */
export function BonusRoundScreen() {
  const room = useGameStore((s) => s.room);
  const bonusRound = room?.bonusRound as BonusRoundState | null;

  if (!bonusRound) return null;

  // Route to appropriate game type based on type field
  switch (bonusRound.type) {
    case 'hot_button':
      return <HotButtonGame />;
    
    case 'collective_list':
      return <CollectiveListGame />;
    
    default:
      // Fallback: CollectiveListGame als Standard
      console.warn(`Unknown bonus round type: ${(bonusRound as any).type}, falling back to CollectiveListGame`);
      return <CollectiveListGame />;
  }
}
