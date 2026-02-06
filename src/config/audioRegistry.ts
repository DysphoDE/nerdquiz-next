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
 * Vorbereitete TTS-Schnipsel gruppiert nach Kategorie.
 * Pro Kategorie mehrere Varianten für Abwechslung (zufällige Auswahl).
 */
export const TTS_SNIPPETS = {
  correct: [
    '/audio/tts/correct/001.mp3',
    '/audio/tts/correct/002.mp3',
    '/audio/tts/correct/003.mp3',
    '/audio/tts/correct/004.mp3',
    '/audio/tts/correct/005.mp3',
    '/audio/tts/correct/006.mp3',
    '/audio/tts/correct/007.mp3',
  ],
  wrong: [
    '/audio/tts/wrong/001.mp3',
    '/audio/tts/wrong/002.mp3',
    '/audio/tts/wrong/003.mp3',
    '/audio/tts/wrong/004.mp3',
    '/audio/tts/wrong/005.mp3',
    '/audio/tts/wrong/006.mp3',
    '/audio/tts/wrong/007.mp3',
    '/audio/tts/wrong/008.mp3',
  ],
  welcome: [
    '/audio/tts/welcome/001.mp3',
    '/audio/tts/welcome/002.mp3',
    '/audio/tts/welcome/003.mp3',
    '/audio/tts/welcome/004.mp3',
    '/audio/tts/welcome/005.mp3',
  ],
} as const;

// ============================================
// TYPE HELPERS
// ============================================

export type MusicKey = keyof typeof MUSIC;
export type SfxKey = keyof typeof SFX;
export type TtsSnippetCategory = keyof typeof TTS_SNIPPETS;
