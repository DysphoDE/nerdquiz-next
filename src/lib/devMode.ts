/**
 * Dev Mode Manager
 * 
 * Ermöglicht das Aktivieren des Dev-Modus:
 * 1. Automatisch wenn NODE_ENV === 'development'
 * 2. Manuell durch Eingabe des geheimen Codes in der Lobby
 * 
 * Der State wird im localStorage persistiert.
 */

const DEV_MODE_KEY = 'nerdquiz_dev_mode';
const SECRET_CODE = 'clairobscur99';

// Check if running in dev environment
const isDevEnvironment = process.env.NODE_ENV === 'development';

// In-memory state for SSR safety
let devModeEnabled = isDevEnvironment;
let listeners: Set<() => void> = new Set();

/**
 * Initialize dev mode from localStorage (client-side only)
 */
export function initDevMode(): void {
  if (typeof window === 'undefined') return;
  
  // Always enabled in dev environment
  if (isDevEnvironment) {
    devModeEnabled = true;
    return;
  }
  
  // Check localStorage for manual activation
  try {
    const stored = localStorage.getItem(DEV_MODE_KEY);
    devModeEnabled = stored === 'true';
  } catch {
    devModeEnabled = false;
  }
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
    
    // Persist to localStorage
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(DEV_MODE_KEY, 'true');
      } catch {
        // Ignore storage errors
      }
    }
    
    // Notify listeners
    listeners.forEach(fn => fn());
    
    console.log('🔧 Dev mode activated!');
    return true;
  }
  return false;
}

/**
 * Deactivate dev mode
 */
export function deactivateDevMode(): void {
  // Can't deactivate in dev environment
  if (isDevEnvironment) return;
  
  devModeEnabled = false;
  
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(DEV_MODE_KEY);
    } catch {
      // Ignore storage errors
    }
  }
  
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

