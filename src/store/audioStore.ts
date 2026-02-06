/**
 * Zustand Audio Store
 * 
 * Persistierter Store für Audio-Einstellungen (Volume, Mute).
 * Wird via localStorage gespeichert, sodass Einstellungen über Sessions erhalten bleiben.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AudioState {
  // Volume levels (0-1)
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  ttsVolume: number;

  // Mute
  isMuted: boolean;
}

interface AudioActions {
  setMasterVolume: (volume: number) => void;
  setMusicVolume: (volume: number) => void;
  setSfxVolume: (volume: number) => void;
  setTtsVolume: (volume: number) => void;
  toggleMute: () => void;
  setMuted: (muted: boolean) => void;
  resetToDefaults: () => void;
}

export type AudioStore = AudioState & AudioActions;

const DEFAULT_STATE: AudioState = {
  masterVolume: 0.7,
  musicVolume: 0.5,
  sfxVolume: 0.8,
  ttsVolume: 0.9,
  isMuted: false,
};

/** Clamp a value between 0 and 1 */
const clampVolume = (v: number) => Math.max(0, Math.min(1, v));

export const useAudioStore = create<AudioStore>()(
  persist(
    (set) => ({
      ...DEFAULT_STATE,

      setMasterVolume: (volume) => set({ masterVolume: clampVolume(volume) }),
      setMusicVolume: (volume) => set({ musicVolume: clampVolume(volume) }),
      setSfxVolume: (volume) => set({ sfxVolume: clampVolume(volume) }),
      setTtsVolume: (volume) => set({ ttsVolume: clampVolume(volume) }),

      toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
      setMuted: (muted) => set({ isMuted: muted }),

      resetToDefaults: () => set(DEFAULT_STATE),
    }),
    {
      name: 'nerdquiz-audio-settings',
      // Only persist the state values, not the actions
      partialize: (state) => ({
        masterVolume: state.masterVolume,
        musicVolume: state.musicVolume,
        sfxVolume: state.sfxVolume,
        ttsVolume: state.ttsVolume,
        isMuted: state.isMuted,
      }),
    }
  )
);
