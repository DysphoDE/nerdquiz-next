/**
 * TTS (Text-to-Speech) Constants
 * 
 * Konfiguration für die KI-gestützte Sprachsynthese im Nerdquiz.
 * Unterstützt OpenAI TTS und ElevenLabs als Provider.
 * Der aktive Provider wird über TTS_PROVIDER gesteuert.
 */

// ============================================
// TTS PROVIDER
// ============================================

/**
 * Verfügbare TTS-Provider
 */
export const TTS_PROVIDERS = {
  OPENAI: 'openai',
  ELEVENLABS: 'elevenlabs',
} as const;

export type TtsProvider = typeof TTS_PROVIDERS[keyof typeof TTS_PROVIDERS];

/**
 * ⚡ AKTIVER TTS-PROVIDER
 * 
 * Hier umschalten welcher Provider für die Sprachsynthese genutzt wird:
 * - 'openai'     → OpenAI TTS (gpt-4o-mini-tts, tts-1, tts-1-hd)
 * - 'elevenlabs' → ElevenLabs TTS (eleven_multilingual_v2 etc.)
 */
export const TTS_PROVIDER: TtsProvider = TTS_PROVIDERS.ELEVENLABS;

// ============================================
// OPENAI VOICES
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
// OPENAI MODELS
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
// ELEVENLABS CONFIGURATION
// ============================================

/**
 * ElevenLabs TTS Modelle
 * 
 * - eleven_multilingual_v2: Bestes multilinguales Modell, unterstützt Deutsch
 * - eleven_turbo_v2_5: Schneller, niedrigere Latenz
 */
export const ELEVENLABS_MODELS = {
  MULTILINGUAL_V2: 'eleven_multilingual_v2',
  TURBO_V2_5: 'eleven_turbo_v2_5',
} as const;

export type ElevenLabsModel = typeof ELEVENLABS_MODELS[keyof typeof ELEVENLABS_MODELS];

/**
 * ElevenLabs Voice-Konfiguration
 */
export const ELEVENLABS_CONFIG = {
  /** API Base URL */
  API_BASE_URL: 'https://api.elevenlabs.io',

  /** Voice ID für die Quizmaster-Stimme */
  VOICE_ID: 'DQ4rTqXxHr077oQgsA9D',

  /** Standard-Modell */
  DEFAULT_MODEL: ELEVENLABS_MODELS.MULTILINGUAL_V2 as ElevenLabsModel,

  /** Ausgabeformat (mp3_44100_128 = gute Qualität) */
  OUTPUT_FORMAT: 'mp3_44100_128' as const,

  /** Sprache (ISO 639-1) */
  LANGUAGE_CODE: 'de',

  /** Voice Settings */
  VOICE_SETTINGS: {
    /** Stabilität (0-1): Höher = stabiler, weniger emotional */
    stability: 0.5,
    /** Similarity Boost (0-1): Höher = näher am Original */
    similarity_boost: 0.75,
    /** Style (0-1): Höher = mehr Stil-Übertreibung (kostet Latenz) */
    style: 0.0,
    /** Speaker Boost: Verstärkt Ähnlichkeit zum Original */
    use_speaker_boost: true,
    /** Sprechgeschwindigkeit (0.7 - 1.2) */
    speed: 1.0,
  },
} as const;

// ============================================
// SHARED TTS CONFIGURATION
// ============================================

/**
 * Standard TTS-Konfiguration für das Nerdquiz (OpenAI-Defaults)
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
// VOLUME NORMALIZATION
// ============================================

/**
 * Lautstärke-Gain-Faktoren zur Normalisierung zwischen verschiedenen Audio-Quellen.
 * 
 * Da API-generiertes TTS-Audio (OpenAI/ElevenLabs) und vorproduzierte
 * Moderator-Snippets unterschiedliche Quell-Lautstärken haben können,
 * werden diese Multiplikatoren auf den jeweiligen ttsVolume-Kanal angewendet.
 * 
 * Wert 1.0 = keine Änderung, <1.0 = leiser, >1.0 = lauter
 * Einfach anpassen bis beide Quellen gleich laut klingen.
 */
export const TTS_VOLUME_GAIN = {
  /** Gain für API-generiertes TTS-Audio (OpenAI / ElevenLabs) */
  API_TTS: 1.0,
  /** Gain für vorproduzierte Moderator-Snippet-MP3s */
  SNIPPETS: 1.0,
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
// TTS CACHE
// ============================================

/**
 * TTS-Cache-Konfiguration
 * 
 * Einmal generierte TTS-Audiodateien werden pro Frage-ID auf dem Server
 * gespeichert. Bei erneutem Abspielen wird die gecachte Datei ausgeliefert
 * statt einen neuen API-Call zu machen. Spart massiv Kosten!
 * 
 * Cache-Pfad: public/audio/tts-cache/{questionId}.mp3
 */
export const TTS_CACHE = {
  /** Cache aktivieren/deaktivieren */
  ENABLED: true,
  
  /** Verzeichnis relativ zum Projekt-Root (für serverseitiges Lesen/Schreiben) */
  DIR: 'public/audio/tts-cache',
  
  /** URL-Prefix für den Client (zum direkten Abrufen gecachter Dateien) */
  PUBLIC_URL_PREFIX: '/audio/tts-cache',
} as const;

// ============================================
// HELPER TYPES
// ============================================

/**
 * Type für alle TTS Konstanten
 */
export type TtsConstant =
  | TtsVoice
  | TtsModel
  | ElevenLabsModel
  | TtsProvider
  | typeof TTS_CONFIG[keyof typeof TTS_CONFIG]
  | TtsInstructionKey;
