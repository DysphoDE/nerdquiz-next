/**
 * AudioManager - Singleton
 * 
 * Zentrale Audio-Engine basierend auf Howler.js.
 * Verwaltet 3 Kanäle: Music, SFX, TTS (OpenAI).
 * Kann außerhalb von React verwendet werden.
 */

import { Howl, Howler } from 'howler';
import { MUSIC, SFX, TTS_SNIPPETS, loadTtsSnippets, type MusicKey, type SfxKey, type TtsSnippetCategory } from '@/config/audioRegistry';
import {
  TTS_CONFIG,
  TTS_INSTRUCTIONS,
  TTS_API,
  TTS_VOLUME_GAIN,
  type TtsVoice,
  type TtsModel,
  type TtsInstructionKey,
} from '@/config/constants/tts';

// ============================================
// TYPES
// ============================================

export interface PlayMusicOptions {
  /** Fade-in duration in ms (default: 1000) */
  fadeIn?: number;
  /** Fade-out duration for previous track in ms (default: 1000) */
  fadeOut?: number;
  /** Loop the track (default: true for music) */
  loop?: boolean;
}

export interface PlayTTSOptions {
  /** OpenAI Voice ID (default: aus TTS_CONFIG) */
  voice?: TtsVoice;
  /** OpenAI TTS Model (default: aus TTS_CONFIG) */
  model?: TtsModel;
  /** Freitext-Instructions für die Stimme */
  instructions?: string;
  /** Vordefinierter Instruction-Key aus TTS_INSTRUCTIONS */
  instructionKey?: TtsInstructionKey;
  /** Sprechgeschwindigkeit 0.25 - 4.0 (default: 1.0) */
  speed?: number;
  /** Frage-ID für serverseitiges Caching (spart API-Kosten bei Wiederholung) */
  questionId?: string;
  /** Callback wenn die Wiedergabe fertig ist */
  onEnd?: () => void;
  /** Callback bei Fehler */
  onError?: (error: Error) => void;
}

// ============================================
// AUDIO MANAGER
// ============================================

class AudioManager {
  // Singleton
  private static instance: AudioManager | null = null;

  // Sound cache (lazy-loaded Howl instances)
  private musicCache: Map<string, Howl> = new Map();
  private sfxCache: Map<string, Howl> = new Map();
  private snippetCache: Map<string, Howl> = new Map();

  // Track last played snippet index per category to avoid immediate repeats
  private lastSnippetIndex: Map<string, number> = new Map();

  // Currently playing music
  private currentMusic: Howl | null = null;
  private currentMusicKey: string | null = null;

  // Pending music request (when AudioContext was locked)
  private pendingMusic: { key: MusicKey; options: PlayMusicOptions } | null = null;

  // TTS state
  private currentTTS: Howl | null = null;
  private ttsAbortController: AbortController | null = null;
  private ttsLoading = false;

  // Currently playing snippet (to prevent overlapping snippet playback)
  private currentSnippetHowl: Howl | null = null;
  private currentSnippetSrc: string | null = null;

  // Volume state (synced from audioStore via useAudio hook)
  private masterVolume = 0.5;
  private musicVolume = 0.1;
  private sfxVolume = 0.65;
  private ttsVolume = 0.4;

  // Track failed loads to avoid repeated attempts
  private failedLoads: Set<string> = new Set();

  // Whether TTS snippets have been loaded
  private snippetsLoaded = false;
  private snippetsLoadingPromise: Promise<void> | null = null;

  private constructor() {
    // Private constructor for singleton
  }

  static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  /**
   * Lädt TTS-Snippets vom Server (einmalig).
   * Wird automatisch von useAudioInit aufgerufen.
   */
  async loadSnippets(): Promise<void> {
    if (this.snippetsLoaded) return;
    if (this.snippetsLoadingPromise) return this.snippetsLoadingPromise;

    this.snippetsLoadingPromise = loadTtsSnippets().then(() => {
      this.snippetsLoaded = true;
    });

    return this.snippetsLoadingPromise;
  }

  // ============================================
  // MUSIC
  // ============================================

  /**
   * Play background music by key. Stops any currently playing music.
   * Supports crossfade between tracks.
   * 
   * If the AudioContext is still locked (no user gesture yet), the request
   * is stored and automatically retried once the context is unlocked.
   */
  playMusic(key: MusicKey, options: PlayMusicOptions = {}): void {
    const {
      fadeIn = 1000,
      fadeOut = 1000,
      loop = true,
    } = options;

    const src = MUSIC[key];
    if (!src) {
      console.warn(`[AudioManager] Unknown music key: "${key}"`);
      return;
    }

    // Don't restart if same track is already playing
    if (this.currentMusicKey === key && this.currentMusic?.playing()) {
      this.pendingMusic = null;
      return;
    }

    // Check if AudioContext is available and running
    const ctx = Howler.ctx;
    if (ctx && ctx.state === 'suspended') {
      console.log(`[AudioManager] AudioContext suspended — queueing music "${key}" for later`);
      this.pendingMusic = { key, options };
      return;
    }

    // Clear pending since we're playing now
    this.pendingMusic = null;

    // Fade out current music
    if (this.currentMusic) {
      const oldMusic = this.currentMusic;
      oldMusic.fade(oldMusic.volume(), 0, fadeOut);
      oldMusic.once('fade', () => {
        oldMusic.stop();
      });
    }

    // Get or create Howl instance
    const howl = this.getOrCreateMusic(key, src, loop);
    if (!howl) return;

    // Set initial volume to 0 for fade-in
    const targetVolume = this.masterVolume * this.musicVolume;
    howl.volume(0);
    howl.play();
    howl.fade(0, targetVolume, fadeIn);

    this.currentMusic = howl;
    this.currentMusicKey = key;
  }

  /**
   * Retry playing music that was queued while AudioContext was locked.
   * Called by useAudioInit after a user gesture unlocks the context.
   */
  retryPendingMusic(): void {
    if (!this.pendingMusic) return;
    const { key, options } = this.pendingMusic;
    console.log(`[AudioManager] Retrying pending music: "${key}"`);
    this.pendingMusic = null;
    this.playMusic(key, options);
  }

  /**
   * Stop the currently playing music.
   */
  stopMusic(fadeOut = 1000): void {
    // Also clear any pending music request
    this.pendingMusic = null;

    if (!this.currentMusic) return;

    const music = this.currentMusic;
    this.currentMusic = null;
    this.currentMusicKey = null;

    if (fadeOut > 0) {
      music.fade(music.volume(), 0, fadeOut);
      music.once('fade', () => {
        music.stop();
      });
    } else {
      music.stop();
    }
  }

  /**
   * Check if music is currently playing.
   */
  isMusicPlaying(): boolean {
    return this.currentMusic?.playing() ?? false;
  }

  /**
   * Get the currently playing music key.
   */
  getCurrentMusicKey(): MusicKey | null {
    return this.currentMusicKey as MusicKey | null;
  }

  // ============================================
  // SFX
  // ============================================

  /**
   * Play a sound effect. Multiple SFX can overlap.
   */
  playSfx(key: SfxKey): void {
    const src = SFX[key];
    if (!src) {
      console.warn(`[AudioManager] Unknown SFX key: "${key}"`);
      return;
    }

    const howl = this.getOrCreateSfx(key, src);
    if (!howl) return;

    // Update volume before playing (in case it changed)
    howl.volume(this.masterVolume * this.sfxVolume);
    howl.play();
  }

  // ============================================
  // TTS (Text-to-Speech via /api/tts)
  // ============================================

  /**
   * Generiert und spielt TTS-Audio über die /api/tts Route.
   * Der Provider (OpenAI oder ElevenLabs) wird serverseitig über TTS_PROVIDER gesteuert.
   * 
   * @param text - Der vorzulesende Text
   * @param options - Optionale TTS-Konfiguration (Stimme, Modell, Instructions etc.)
   * @returns Promise die resolved wenn die Wiedergabe beendet ist
   */
  async playTTS(text: string, options: PlayTTSOptions = {}): Promise<void> {
    const {
      voice,
      model,
      instructions,
      instructionKey,
      speed,
      questionId,
      onEnd,
      onError,
    } = options;

    // Don't overlap TTS - stop any existing playback
    this.stopTTS();

    if (!text || text.trim().length === 0) {
      console.warn('[AudioManager] TTS: Leerer Text, übersprungen.');
      return;
    }

    // Create abort controller for this request
    this.ttsAbortController = new AbortController();
    this.ttsLoading = true;

    try {
      // Build request body
      const body: Record<string, unknown> = { text };
      if (voice) body.voice = voice;
      if (model) body.model = model;
      if (instructions) body.instructions = instructions;
      if (instructionKey) body.instructionKey = instructionKey;
      if (speed !== undefined) body.speed = speed;
      if (questionId) body.questionId = questionId;

      // Fetch audio from API route
      const response = await fetch(TTS_API.ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: this.ttsAbortController.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `TTS API Error ${response.status}: ${errorData.error || 'Unbekannt'}`
        );
      }

      // Get audio as blob
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      // Play via Howler
      return new Promise<void>((resolve, reject) => {
        const howl = new Howl({
          src: [audioUrl],
          format: [TTS_CONFIG.OUTPUT_FORMAT],
          volume: this.masterVolume * this.ttsVolume * TTS_VOLUME_GAIN.API_TTS,
          html5: true,
          onend: () => {
            this.cleanupTTS(audioUrl);
            onEnd?.();
            resolve();
          },
          onloaderror: (_id, error) => {
            console.error('[AudioManager] TTS load error:', error);
            this.cleanupTTS(audioUrl);
            const err = new Error(`TTS Ladefehler: ${error}`);
            onError?.(err);
            reject(err);
          },
          onplayerror: (_id, error) => {
            console.error('[AudioManager] TTS play error:', error);
            this.cleanupTTS(audioUrl);
            const err = new Error(`TTS Wiedergabefehler: ${error}`);
            onError?.(err);
            reject(err);
          },
        });

        this.currentTTS = howl;
        this.ttsLoading = false;
        howl.play();
      });
    } catch (error) {
      this.ttsLoading = false;

      // Don't log abort errors (intentional stop)
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }

      console.error('[AudioManager] TTS error:', error);
      const err = error instanceof Error ? error : new Error('TTS Fehler');
      onError?.(err);
      throw err;
    }
  }

  /**
   * Stoppt aktuell laufende TTS-Wiedergabe und bricht laufende Requests ab.
   */
  stopTTS(): void {
    // Abort any pending fetch
    if (this.ttsAbortController) {
      this.ttsAbortController.abort();
      this.ttsAbortController = null;
    }

    // Stop and unload current TTS Howl
    if (this.currentTTS) {
      const ttsUrl = (this.currentTTS as unknown as { _src?: string[] })._src?.[0];
      this.currentTTS.stop();
      this.currentTTS.unload();
      this.currentTTS = null;

      // Revoke blob URL
      if (ttsUrl && ttsUrl.startsWith('blob:')) {
        URL.revokeObjectURL(ttsUrl);
      }
    }

    this.ttsLoading = false;
  }

  /**
   * Prüft ob TTS gerade spricht oder lädt.
   */
  isTTSActive(): boolean {
    return this.ttsLoading || (this.currentTTS?.playing() ?? false);
  }

  // ============================================
  // MODERATOR SNIPPETS (vorproduzierte TTS-Clips)
  // ============================================

  /**
   * Spielt einen zufälligen vorproduzierten Moderator-Clip aus einer Kategorie ab.
   * Nutzt den TTS-Lautstärkekanal. Vermeidet direkte Wiederholung des gleichen Clips.
   *
   * @param category - Die Snippet-Kategorie (z.B. 'correct', 'wrong', 'welcome')
   * @returns Promise die resolved wenn die Wiedergabe beendet ist
   */
  playModeratorSnippet(category: TtsSnippetCategory): Promise<void> {
    // Stop any currently playing snippet to prevent overlapping playback
    this.stopCurrentSnippet();

    return new Promise<void>((resolve) => {
      const files = TTS_SNIPPETS[category];
      if (!files || files.length === 0) {
        console.warn(`[AudioManager] No snippets loaded for category "${category}"`);
        resolve();
        return;
      }
      const fileCount = files.length;

      // Pick a random index, avoiding the last one played
      let index: number;
      const lastIndex = this.lastSnippetIndex.get(category) ?? -1;
      if (fileCount === 1) {
        index = 0;
      } else {
        do {
          index = Math.floor(Math.random() * fileCount);
        } while (index === lastIndex);
      }
      this.lastSnippetIndex.set(category, index);

      const src = files[index];
      const cacheKey = `snippet:${src}`;

      // Don't retry previously failed loads
      if (this.failedLoads.has(cacheKey)) {
        resolve();
        return;
      }

      let howl = this.snippetCache.get(src);
      if (!howl) {
        howl = new Howl({
          src: [src],
          volume: this.masterVolume * this.ttsVolume * TTS_VOLUME_GAIN.SNIPPETS,
          preload: true,
          onloaderror: (_id, error) => {
            console.warn(`[AudioManager] Failed to load snippet "${src}":`, error);
            this.failedLoads.add(cacheKey);
            this.snippetCache.delete(src);
            resolve();
          },
        });
        this.snippetCache.set(src, howl);
      }

      // Update volume before playing (in case it changed)
      howl.volume(this.masterVolume * this.ttsVolume * TTS_VOLUME_GAIN.SNIPPETS);

      // Clear any stale listeners from previous stopped plays
      // (stop() doesn't trigger 'end', so once() listeners accumulate)
      howl.off('end');
      howl.off('playerror');

      // Track this as the current snippet
      this.currentSnippetSrc = src;
      this.currentSnippetHowl = howl;

      // Resolve when playback finishes (or on error)
      howl.once('end', () => {
        this.currentSnippetHowl = null;
        this.currentSnippetSrc = null;
        resolve();
      });
      howl.once('playerror', () => {
        this.currentSnippetHowl = null;
        this.currentSnippetSrc = null;
        resolve();
      });

      howl.play();
    });
  }

  /**
   * Stoppt den aktuell laufenden Moderator-Snippet-Clip.
   *
   * Handles two edge cases:
   * 1. Loading Howls: stop() doesn't cancel queued play() calls.
   *    We must unload() to prevent playback after load completes.
   * 2. Stale listeners: stop() doesn't trigger 'end', so once()
   *    listeners accumulate. We clear them explicitly.
   */
  private stopCurrentSnippet(): void {
    if (this.currentSnippetHowl) {
      const howl = this.currentSnippetHowl;
      const src = this.currentSnippetSrc;
      this.currentSnippetHowl = null;
      this.currentSnippetSrc = null;

      // Remove event listeners to prevent stale callbacks
      howl.off('end');
      howl.off('playerror');

      // If still loading, stop() won't prevent the queued play() from firing
      // once loading completes. Use unload() and remove from cache.
      if (howl.state() === 'loading') {
        howl.unload();
        if (src) {
          this.snippetCache.delete(src);
        }
      } else {
        howl.stop();
      }
    }
  }

  /**
   * Preload alle Moderator-Snippets einer Kategorie für sofortige Wiedergabe.
   */
  preloadSnippets(categories: TtsSnippetCategory[]): void {
    for (const category of categories) {
      const files = TTS_SNIPPETS[category];
      if (!files) continue;
      for (const src of files) {
        if (!this.snippetCache.has(src) && !this.failedLoads.has(`snippet:${src}`)) {
          const howl = new Howl({
            src: [src],
            preload: true,
            onloaderror: (_id, error) => {
              console.warn(`[AudioManager] Failed to preload snippet "${src}":`, error);
              this.failedLoads.add(`snippet:${src}`);
              this.snippetCache.delete(src);
            },
          });
          this.snippetCache.set(src, howl);
        }
      }
    }
  }

  // ============================================
  // VOLUME CONTROL
  // ============================================

  /**
   * Update master volume. Affects all channels.
   */
  setMasterVolume(volume: number): void {
    this.masterVolume = volume;
    this.updateMusicVolume();
    // Update active TTS playback volume
    if (this.currentTTS && this.currentTTS.playing()) {
      this.currentTTS.volume(this.masterVolume * this.ttsVolume * TTS_VOLUME_GAIN.API_TTS);
    }
    // SFX volume is set per-play, no need to update existing instances
  }

  /**
   * Update music channel volume.
   */
  setMusicVolume(volume: number): void {
    this.musicVolume = volume;
    this.updateMusicVolume();
  }

  /**
   * Update SFX channel volume.
   */
  setSfxVolume(volume: number): void {
    this.sfxVolume = volume;
    // SFX volume is applied when playing, no active instances to update
  }

  /**
   * Update TTS channel volume.
   */
  setTtsVolume(volume: number): void {
    this.ttsVolume = volume;
    // Update active TTS playback volume
    if (this.currentTTS && this.currentTTS.playing()) {
      this.currentTTS.volume(this.masterVolume * this.ttsVolume * TTS_VOLUME_GAIN.API_TTS);
    }
  }

  /**
   * Set global mute state.
   */
  setMuted(muted: boolean): void {
    Howler.mute(muted);
  }

  // ============================================
  // PRELOADING
  // ============================================

  /**
   * Preload music tracks for instant playback.
   */
  preloadMusic(keys: MusicKey[]): void {
    for (const key of keys) {
      const src = MUSIC[key];
      if (src) {
        this.getOrCreateMusic(key, src, true);
      }
    }
  }

  /**
   * Preload sound effects for instant playback.
   */
  preloadSfx(keys: SfxKey[]): void {
    for (const key of keys) {
      const src = SFX[key];
      if (src) {
        this.getOrCreateSfx(key, src);
      }
    }
  }

  // ============================================
  // CLEANUP
  // ============================================

  /**
   * Stop all audio and unload everything.
   */
  stopAll(): void {
    this.pendingMusic = null;
    this.stopMusic(0);
    this.stopTTS();
    this.stopCurrentSnippet();
    Howler.stop();
  }

  /**
   * Unload all cached sounds to free memory.
   */
  unloadAll(): void {
    this.stopAll();

    for (const howl of this.musicCache.values()) {
      howl.unload();
    }
    for (const howl of this.sfxCache.values()) {
      howl.unload();
    }
    for (const howl of this.snippetCache.values()) {
      howl.unload();
    }

    this.musicCache.clear();
    this.sfxCache.clear();
    this.snippetCache.clear();
    this.failedLoads.clear();
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private getOrCreateMusic(key: string, src: string, loop: boolean): Howl | null {
    const cacheKey = `music:${key}`;

    // Don't retry failed loads
    if (this.failedLoads.has(cacheKey)) return null;

    let howl = this.musicCache.get(key);
    if (!howl) {
      howl = new Howl({
        src: [src],
        loop,
        volume: this.masterVolume * this.musicVolume,
        html5: true, // Use HTML5 Audio for music (better for long tracks, streaming)
        preload: true,
        onloaderror: (_id, error) => {
          console.warn(`[AudioManager] Failed to load music "${key}": ${src}`, error);
          this.failedLoads.add(cacheKey);
          this.musicCache.delete(key);
        },
      });
      this.musicCache.set(key, howl);
    }
    return howl;
  }

  private getOrCreateSfx(key: string, src: string): Howl | null {
    const cacheKey = `sfx:${key}`;

    // Don't retry failed loads
    if (this.failedLoads.has(cacheKey)) return null;

    let howl = this.sfxCache.get(key);
    if (!howl) {
      howl = new Howl({
        src: [src],
        volume: this.masterVolume * this.sfxVolume,
        preload: true,
        onloaderror: (_id, error) => {
          console.warn(`[AudioManager] Failed to load SFX "${key}": ${src}`, error);
          this.failedLoads.add(cacheKey);
          this.sfxCache.delete(key);
        },
      });
      this.sfxCache.set(key, howl);
    }
    return howl;
  }

  /**
   * Update volume on the currently playing music track.
   */
  private updateMusicVolume(): void {
    if (this.currentMusic && this.currentMusic.playing()) {
      this.currentMusic.volume(this.masterVolume * this.musicVolume);
    }
  }

  /**
   * Cleanup after TTS playback (revoke blob URL, reset state).
   */
  private cleanupTTS(blobUrl?: string): void {
    if (blobUrl && blobUrl.startsWith('blob:')) {
      URL.revokeObjectURL(blobUrl);
    }
    this.currentTTS = null;
    this.ttsAbortController = null;
    this.ttsLoading = false;
  }
}

// ============================================
// EXPORT SINGLETON
// ============================================

export const audioManager = AudioManager.getInstance();
