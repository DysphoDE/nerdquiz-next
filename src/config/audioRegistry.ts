/**
 * Audio Registry
 * 
 * Zentrale Definition aller Sound-Keys und ihrer Dateipfade.
 * Neue Sounds hier hinzufügen - der AudioManager lädt sie automatisch.
 * Fehlende Dateien werden graceful ignoriert (Warnung in der Konsole).
 */

// ============================================
// MUSIC - Hintergrundmusik (wird geloopt)
// ============================================

export const MUSIC = {
  lobby: '/audio/music/lobby.mp3',
  question: '/audio/music/question.mp3',
  estimation: '/audio/music/estimation.mp3',
  bonusRound: '/audio/music/bonus-round.mp3',
  hotButton: '/audio/music/hot-button.mp3',
  scoreboard: '/audio/music/scoreboard.mp3',
  finale: '/audio/music/finale.mp3',
  tension: '/audio/music/tension.mp3',
} as const;

// ============================================
// SFX - Einmal-Soundeffekte
// ============================================

export const SFX = {
  // Antworten
  correct: '/audio/sfx/correct.mp3',
  wrong: '/audio/sfx/wrong.mp3',

  // Timer
  timerTick: '/audio/sfx/timer-tick.mp3',
  timerWarning: '/audio/sfx/timer-warning.mp3',
  timeUp: '/audio/sfx/time-up.mp3',

  // Übergänge & UI
  transition: '/audio/sfx/transition.mp3',
  whoosh: '/audio/sfx/whoosh.mp3',
  pop: '/audio/sfx/pop.mp3',
  click: '/audio/sfx/click.mp3',

  // Spiel-Events
  buzz: '/audio/sfx/buzz.mp3',
  diceRoll: '/audio/sfx/dice-roll.mp3',
  wheelSpin: '/audio/sfx/wheel-spin.mp3',
  wheelStop: '/audio/sfx/wheel-stop.mp3',
  countdown: '/audio/sfx/countdown.mp3',

  // Ergebnisse
  drumroll: '/audio/sfx/drumroll.mp3',
  fanfare: '/audio/sfx/fanfare.mp3',
  applause: '/audio/sfx/applause.mp3',
  eliminated: '/audio/sfx/eliminated.mp3',

  // Spieler
  playerJoin: '/audio/sfx/player-join.mp3',
  playerLeave: '/audio/sfx/player-leave.mp3',

  // Bonus Round
  bonusCorrect: '/audio/sfx/bonus-correct.mp3',
  bonusWrong: '/audio/sfx/bonus-wrong.mp3',

  // Streak
  streak3: '/audio/sfx/streak-3.mp3',
  streak5: '/audio/sfx/streak-5.mp3',
  streak10: '/audio/sfx/streak-10.mp3',
} as const;

// ============================================
// TTS SNIPPETS - Vorproduzierte Moderator-Clips
// ============================================

/**
 * Bekannte Snippet-Kategorien (Unterordner in public/audio/tts/).
 * Neue Ordner werden automatisch erkannt - hier nur für Type-Safety eintragen.
 */
export const TTS_SNIPPET_CATEGORIES = ['correct', 'wrong', 'welcome', 'list-intro'] as const;
export type TtsSnippetCategory = (typeof TTS_SNIPPET_CATEGORIES)[number];

/**
 * Dynamisch befüllte Snippet-Registry.
 * Wird beim App-Start via /api/tts-snippets geladen.
 * Einfach MP3-Dateien in public/audio/tts/<kategorie>/ ablegen - fertig!
 */
export const TTS_SNIPPETS: Record<string, string[]> = {};

/**
 * Lädt alle TTS-Snippets vom Server (scannt public/audio/tts/ Ordner).
 * Wird einmalig beim AudioManager-Init aufgerufen.
 */
export async function loadTtsSnippets(): Promise<void> {
  try {
    const res = await fetch('/api/tts-snippets');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: Record<string, string[]> = await res.json();

    // Bestehende Keys leeren und neu befüllen
    for (const key of Object.keys(TTS_SNIPPETS)) {
      delete TTS_SNIPPETS[key];
    }
    Object.assign(TTS_SNIPPETS, data);

    const total = Object.values(data).reduce((sum, arr) => sum + arr.length, 0);
    console.log(`[AudioRegistry] ${total} TTS-Snippets geladen aus ${Object.keys(data).length} Kategorien`);
  } catch (error) {
    console.warn('[AudioRegistry] TTS-Snippets konnten nicht geladen werden:', error);
  }
}

// ============================================
// TYPE HELPERS
// ============================================

export type MusicKey = keyof typeof MUSIC;
export type SfxKey = keyof typeof SFX;
