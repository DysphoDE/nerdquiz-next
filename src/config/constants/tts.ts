/**
 * TTS (Text-to-Speech) Constants
 * 
 * Konfiguration für die KI-gestützte Sprachsynthese im Nerdquiz.
 * Verwendet OpenAI TTS über das Vercel AI SDK.
 */

// ============================================
// AVAILABLE VOICES
// ============================================

/**
 * Verfügbare OpenAI TTS Stimmen
 * 
 * - alloy: Neutral, ausgewogen
 * - ash: Warm, gesprächig
 * - ballad: Weich, melodisch
 * - coral: Klar, freundlich
 * - echo: Tief, resonant
 * - fable: Erzählend, warm
 * - nova: Energetisch, hell
 * - onyx: Tief, autoritär
 * - sage: Ruhig, weise
 * - shimmer: Leicht, optimistisch
 * - verse: Vielseitig, ausdrucksstark
 */
export const TTS_VOICES = {
  ALLOY: 'alloy',
  ASH: 'ash',
  BALLAD: 'ballad',
  CORAL: 'coral',
  ECHO: 'echo',
  FABLE: 'fable',
  NOVA: 'nova',
  ONYX: 'onyx',
  SAGE: 'sage',
  SHIMMER: 'shimmer',
  VERSE: 'verse',
  MARIN: 'marin',
  CEDAR: 'cedar',
} as const;

export type TtsVoice = typeof TTS_VOICES[keyof typeof TTS_VOICES];

// ============================================
// AVAILABLE MODELS
// ============================================

/**
 * Verfügbare OpenAI TTS Modelle
 * 
 * - tts-1: Standard, schneller, günstiger
 * - tts-1-hd: Höhere Qualität, etwas langsamer
 * - gpt-4o-mini-tts: Neuestes Modell, unterstützt Instructions/Persona
 */
export const TTS_MODELS = {
  STANDARD: 'tts-1',
  HD: 'tts-1-hd',
  GPT4O_MINI: 'gpt-4o-mini-tts',
} as const;

export type TtsModel = typeof TTS_MODELS[keyof typeof TTS_MODELS];

// ============================================
// TTS CONFIGURATION
// ============================================

/**
 * Standard TTS-Konfiguration für das Nerdquiz
 */
export const TTS_CONFIG = {
  /** Standard-Modell (gpt-4o-mini-tts für Instructions-Support) */
  DEFAULT_MODEL: TTS_MODELS.GPT4O_MINI,
  
  /** Standard-Stimme */
  DEFAULT_VOICE: TTS_VOICES.CEDAR,
  
  /** Sprechgeschwindigkeit (0.25 - 4.0, 1.0 = normal) */
  DEFAULT_SPEED: 1.1,
  
  /** Ausgabeformat */
  OUTPUT_FORMAT: 'mp3' as const,
  
  /** Sprache (ISO 639-1) */
  LANGUAGE: 'de',
  
  /** Timeout für TTS-Requests in Millisekunden */
  REQUEST_TIMEOUT: 15000,
  
  /** Maximale Textlänge die an TTS geschickt wird */
  MAX_TEXT_LENGTH: 1000,
  
  /** Maximale Retries bei Fehlern */
  MAX_RETRIES: 2,
} as const;

// ============================================
// QUIZMASTER INSTRUCTIONS
// ============================================

/**
 * System-Instructions für die TTS-Stimme.
 * Nur von gpt-4o-mini-tts unterstützt.
 * 
 * Definiert die Persönlichkeit und den Sprechstil des Quizmasters.
 */
export const TTS_INSTRUCTIONS = {
  /** Standard Quizmaster-Persona für Fragen */
  QUESTION: `Du bist ein charismatischer, energiegeladener Quizmaster in einer Nerd-Quizshow.
Lies die Quizfrage klar und deutlich vor, allerdings nicht zu langsam, da die Spieler bereits antworten können.`,

  /** Für Schätzfragen */
  ESTIMATION: `Du bist ein charismatischer Quizmaster in einer Nerd-Quizshow.
Lies die Schätzfrage mit einem neugierigen, herausfordernden Unterton vor.
Betone, dass es sich um eine Schätzung handelt. Mach es spannend!
Sprich auf Deutsch mit einem unterhaltsamen Ton.`,

  /** Für die Auflösung der richtigen Antwort */
  REVEAL: `Du bist ein Quizmaster der die richtige Antwort enthüllt.
Lies die Antwort mit einem triumphalen, enthüllenden Ton vor.
Kurz und prägnant, aber dramatisch.`,

  /** Für Ankündigungen (Kategorien, Runden etc.) */
  ANNOUNCEMENT: `Du bist ein energiegeladener Showmaster.
Kündige das Folgende mit Begeisterung und Showcharakter an.
Kurz, knackig und mitreißend auf Deutsch.`,

  /** Für Hot Button Fragen (schnelles Buzzer-Format) */
  HOT_BUTTON: `Du bist ein schneller, energiegeladener Quizmaster.
Lies die Frage zügig aber klar vor - die Spieler müssen schnell buzzen!
Erzeuge Zeitdruck und Spannung in deiner Stimme.`,
} as const;

export type TtsInstructionKey = keyof typeof TTS_INSTRUCTIONS;

// ============================================
// TTS API ROUTE
// ============================================

/**
 * API Route-Konfiguration
 */
export const TTS_API = {
  /** Endpoint für TTS-Generierung */
  ENDPOINT: '/api/tts',
  
  /** Content-Type des Audio-Responses */
  CONTENT_TYPE: 'audio/mpeg',
} as const;

// ============================================
// HELPER TYPE
// ============================================

/**
 * Type für alle TTS Konstanten
 */
export type TtsConstant =
  | TtsVoice
  | TtsModel
  | typeof TTS_CONFIG[keyof typeof TTS_CONFIG]
  | TtsInstructionKey;
