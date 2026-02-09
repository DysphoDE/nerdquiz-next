'use client';

/**
 * useAudio Hook
 * 
 * Brücke zwischen React und dem AudioManager Singleton.
 * - Synchronisiert audioStore-Änderungen mit dem AudioManager
 * - Handhabt Browser Autoplay-Unlock (erster User-Klick)
 * - Exponiert einfache API für Komponenten
 */

import { useEffect, useCallback } from 'react';
import { useAudioStore } from '@/store/audioStore';
import { audioManager, type PlayTTSOptions } from '@/lib/audioManager';
import type { MusicKey, SfxKey, TtsSnippetCategory } from '@/config/audioRegistry';

// Module-level flag: survives re-mounts, reset only on full page reload
let audioContextUnlocked = false;

/**
 * Initialize audio system and sync store with AudioManager.
 * Call this once at the app/room level.
 */
export function useAudioInit() {
  const masterVolume = useAudioStore((s) => s.masterVolume);
  const musicVolume = useAudioStore((s) => s.musicVolume);
  const sfxVolume = useAudioStore((s) => s.sfxVolume);
  const ttsVolume = useAudioStore((s) => s.ttsVolume);
  const isMuted = useAudioStore((s) => s.isMuted);

  // Sync volume changes to AudioManager
  useEffect(() => {
    audioManager.setMasterVolume(masterVolume);
  }, [masterVolume]);

  useEffect(() => {
    audioManager.setMusicVolume(musicVolume);
  }, [musicVolume]);

  useEffect(() => {
    audioManager.setSfxVolume(sfxVolume);
  }, [sfxVolume]);

  useEffect(() => {
    audioManager.setTtsVolume(ttsVolume);
  }, [ttsVolume]);

  useEffect(() => {
    audioManager.setMuted(isMuted);
  }, [isMuted]);

  // Browser Autoplay Unlock
  // Most browsers require a user gesture before audio can play.
  // We listen for click/touch/keydown and resume the AudioContext.
  // Uses a module-level flag so it survives React re-mounts.
  useEffect(() => {
    const tryUnlock = () => {
      const ctx = (window as unknown as { Howler?: { ctx?: AudioContext } }).Howler?.ctx;
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().then(() => {
          console.log('[Audio] AudioContext resumed after user gesture');
          audioContextUnlocked = true;
          // If music was supposed to be playing, retry it
          audioManager.retryPendingMusic();
        }).catch(() => {});
      } else if (ctx && ctx.state === 'running') {
        audioContextUnlocked = true;
        // Context already running — retry any pending music that may have failed earlier
        audioManager.retryPendingMusic();
      }
    };

    // If already unlocked, just make sure context is still running
    if (audioContextUnlocked) {
      tryUnlock();
      return;
    }

    const unlock = () => {
      tryUnlock();
      // Keep listening — some browsers need multiple gestures
      // We'll clean up only when the component unmounts
    };

    document.addEventListener('click', unlock, true);
    document.addEventListener('touchstart', unlock, true);
    document.addEventListener('keydown', unlock, true);

    return () => {
      document.removeEventListener('click', unlock, true);
      document.removeEventListener('touchstart', unlock, true);
      document.removeEventListener('keydown', unlock, true);
    };
  }, []);

  // Lower music volume when tab is not visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        audioManager.setMasterVolume(masterVolume * 0.3);
      } else {
        audioManager.setMasterVolume(masterVolume);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [masterVolume]);

  // Load TTS snippets from server (scans public/audio/tts/ folder)
  useEffect(() => {
    audioManager.loadSnippets();
  }, []);

  // NOTE: No stopAll() on unmount!
  // The AudioManager is a singleton that persists across screen transitions.
  // Music should continue playing across phase changes (e.g. lobby → game).
  // Individual screens call stopMusic/playMusic as needed.
}

/**
 * Hook for playing audio in components.
 * Does NOT initialize the audio system - use useAudioInit for that.
 */
export function useAudio() {
  const { toggleMute, setMasterVolume, setMusicVolume, setSfxVolume, setTtsVolume } = useAudioStore();
  const isMuted = useAudioStore((s) => s.isMuted);
  const masterVolume = useAudioStore((s) => s.masterVolume);
  const musicVolume = useAudioStore((s) => s.musicVolume);
  const sfxVolume = useAudioStore((s) => s.sfxVolume);
  const ttsVolume = useAudioStore((s) => s.ttsVolume);

  const playMusic = useCallback((key: MusicKey, options?: Parameters<typeof audioManager.playMusic>[1]) => {
    audioManager.playMusic(key, options);
  }, []);

  const stopMusic = useCallback((fadeOut?: number) => {
    audioManager.stopMusic(fadeOut);
  }, []);

  const playSfx = useCallback((key: SfxKey) => {
    audioManager.playSfx(key);
  }, []);

  const playTTS = useCallback((text: string, options?: PlayTTSOptions): Promise<void> => {
    return audioManager.playTTS(text, options).catch(() => {});
  }, []);

  const playTTSFromUrl = useCallback((url: string): Promise<void> => {
    return audioManager.playTTSFromUrl(url);
  }, []);

  const stopTTS = useCallback(() => {
    audioManager.stopTTS();
  }, []);

  const preloadMusic = useCallback((keys: MusicKey[]) => {
    audioManager.preloadMusic(keys);
  }, []);

  const preloadSfx = useCallback((keys: SfxKey[]) => {
    audioManager.preloadSfx(keys);
  }, []);

  const playModeratorSnippet = useCallback((category: TtsSnippetCategory, snippetIndex?: number): Promise<void> => {
    return audioManager.playModeratorSnippet(category, snippetIndex);
  }, []);

  const preloadSnippets = useCallback((categories: TtsSnippetCategory[]) => {
    audioManager.preloadSnippets(categories);
  }, []);

  return {
    // Playback
    playMusic,
    stopMusic,
    playSfx,
    playTTS,
    playTTSFromUrl,
    stopTTS,
    playModeratorSnippet,
    preloadMusic,
    preloadSfx,
    preloadSnippets,

    // State (read-only, from store)
    isMuted,
    masterVolume,
    musicVolume,
    sfxVolume,
    ttsVolume,

    // Controls (write to store, synced to AudioManager via useAudioInit)
    toggleMute,
    setMasterVolume,
    setMusicVolume,
    setSfxVolume,
    setTtsVolume,
  };
}
