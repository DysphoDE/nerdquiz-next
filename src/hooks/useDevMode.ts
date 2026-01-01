'use client';

import { useState, useEffect, useSyncExternalStore, useCallback } from 'react';
import {
  initDevMode,
  isDevModeEnabled,
  tryActivateDevMode,
  deactivateDevMode,
  subscribeToDevMode,
} from '@/lib/devMode';

/**
 * Hook to access and control dev mode
 */
export function useDevMode() {
  // Initialize on mount
  useEffect(() => {
    initDevMode();
  }, []);

  // Subscribe to changes
  const isEnabled = useSyncExternalStore(
    subscribeToDevMode,
    isDevModeEnabled,
    () => false // Server snapshot
  );

  const activate = useCallback((code: string) => {
    return tryActivateDevMode(code);
  }, []);

  const deactivate = useCallback(() => {
    deactivateDevMode();
  }, []);

  return {
    isDevMode: isEnabled,
    activateDevMode: activate,
    deactivateDevMode: deactivate,
  };
}

