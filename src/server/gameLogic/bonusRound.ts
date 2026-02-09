/**
 * Bonus Round Router
 * 
 * Leitet Bonusrunden an die entsprechende Implementierung weiter:
 * - Collective List → collectiveList.ts
 * - Hot Button → hotButton.ts
 */

import type { Server as SocketServer } from 'socket.io';
import type { GameRoom, BonusRoundConfig } from '../types';
import { 
  startCollectiveListRound,
  handleCollectiveListAnswer,
  handleCollectiveListSkip,
} from './collectiveList';
import {
  startHotButtonRound,
  handleHotButtonBuzz,
  handleHotButtonAnswer,
} from './hotButton';

// Re-export für socketHandlers.ts (Disconnect-Handling)
export { eliminateCollectiveListPlayer as eliminatePlayer } from './collectiveList';
export { handleCollectiveListTimeout as handleBonusRoundTimeout } from './collectiveList';

/**
 * Startet eine Bonusrunde basierend auf dem Fragetyp
 */
export async function startBonusRound(room: GameRoom, io: SocketServer, config: BonusRoundConfig): Promise<void> {
  const questionType = config.questionType?.toLowerCase() || 'liste';

  console.log(`🎯 Starting bonus round: ${config.questionType || 'Liste'}`);

  // Route to appropriate implementation
  if (questionType === 'hot button' || questionType === 'hot_button' || questionType === 'buzzer') {
    startHotButtonRound(room, io, config);
  } else {
    // Default: Collective List
    await startCollectiveListRound(room, io, config);
  }
}

/**
 * Verarbeitet eine Antwort in einer Bonusrunde
 */
export function handleBonusRoundAnswer(room: GameRoom, io: SocketServer, playerId: string, answer: string): void {
  const bonusRound = room.state.bonusRound;
  if (!bonusRound) return;
  
  if (bonusRound.type === 'collective_list') {
    handleCollectiveListAnswer(room, io, playerId, answer);
  } else if (bonusRound.type === 'hot_button') {
    handleHotButtonAnswer(room, io, playerId, answer);
  }
}

/**
 * Verarbeitet einen Skip in einer Bonusrunde
 */
export function handleBonusRoundSkip(room: GameRoom, io: SocketServer, playerId: string): void {
  const bonusRound = room.state.bonusRound;
  if (!bonusRound) return;
  
  if (bonusRound.type === 'collective_list') {
    handleCollectiveListSkip(room, io, playerId);
  }
  // Hot Button hat kein Skip
}

/**
 * Verarbeitet einen Buzzer in der Hot Button Runde
 */
export function handleBonusRoundBuzz(room: GameRoom, io: SocketServer, playerId: string): void {
  const bonusRound = room.state.bonusRound;
  if (!bonusRound) return;
  
  if (bonusRound.type === 'hot_button') {
    handleHotButtonBuzz(room, io, playerId);
  }
}
