/**
 * Dev Mode Manager
 * 
 * Ermöglicht das Aktivieren des Dev-Modus:
 * 1. Automatisch wenn NODE_ENV === 'development'
 * 2. Manuell durch Eingabe des geheimen Codes in der Lobby (nur für aktuelle Session)
 * 
 * Der State ist NUR in-memory und gilt nur für die aktuelle Session.
 * Beim Verlassen des Raums oder Neuladen der Seite wird der manuelle Dev-Mode zurückgesetzt.
 */

const SECRET_CODE = 'clairobscur99';

// Check if running in dev environment
const isDevEnvironment = process.env.NODE_ENV === 'development';

// In-memory state - resets on page reload (intentional!)
let devModeEnabled = isDevEnvironment;
let listeners: Set<() => void> = new Set();

/**
 * Initialize dev mode (client-side only)
 * Only enables automatically in development environment
 */
export function initDevMode(): void {
  if (typeof window === 'undefined') return;
  
  // Clean up old localStorage value if exists (from previous implementation)
  try {
    localStorage.removeItem('nerdquiz_dev_mode');
  } catch {
    // Ignore storage errors
  }
  
  // Only auto-enable in dev environment
  // Manual activation via secret code is session-only
  if (isDevEnvironment) {
    devModeEnabled = true;
  }
  // Note: We intentionally do NOT load from localStorage
  // Manual dev mode should be session-specific
}

/**
 * Check if dev mode is currently enabled
 */
export function isDevModeEnabled(): boolean {
  return devModeEnabled;
}

/**
 * Try to activate dev mode with a secret code
 * @returns true if the code was correct and dev mode was activated
 */
export function tryActivateDevMode(code: string): boolean {
  if (code.toLowerCase() === SECRET_CODE.toLowerCase()) {
    devModeEnabled = true;
    
    // Note: We do NOT persist to localStorage
    // Dev mode via secret code is only for the current session
    
    // Notify listeners
    listeners.forEach(fn => fn());
    
    console.log('🔧 Dev mode activated for this session!');
    return true;
  }
  return false;
}

/**
 * Deactivate dev mode (for when leaving a room)
 */
export function deactivateDevMode(): void {
  // Can't deactivate in dev environment
  if (isDevEnvironment) return;
  
  devModeEnabled = false;
  
  // Notify listeners
  listeners.forEach(fn => fn());
}

/**
 * Subscribe to dev mode changes
 */
export function subscribeToDevMode(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}
