/**
 * Server-side TTS Service
 *
 * Generiert TTS-Audio einmalig auf dem Server und cached es als statische Datei.
 * Clients laden dann nur die fertige MP3-Datei statt eigene API-Calls zu machen.
 *
 * Vorteile:
 * - 1 API-Call statt N (pro Spieler) → massive Kosteneinsparung
 * - Keine Race Conditions im File-Cache bei parallelen Clients
 * - In-Memory Deduplizierung paralleler Requests
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  TTS_PROVIDER,
  TTS_CONFIG,
  TTS_CACHE,
  ELEVENLABS_CONFIG,
} from '@/config/constants/tts';

// ============================================
// CACHE HELPERS
// ============================================

/**
 * Sanitized Cache-ID → absoluter Dateipfad
 */
function getCachePath(cacheId: string): string {
  const safeId = cacheId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeId) throw new Error('Ungültige cacheId');
  return join(process.cwd(), TTS_CACHE.DIR, `${safeId}.mp3`);
}

/**
 * Prüft ob gecachte Datei existiert
 */
function getCachedUrl(cacheId: string): string | null {
  if (!TTS_CACHE.ENABLED) return null;

  try {
    const cachePath = getCachePath(cacheId);
    if (existsSync(cachePath)) {
      console.log(`[TTS Service] Cache HIT: ${cacheId}`);
      return `${TTS_CACHE.PUBLIC_URL_PREFIX}/${cacheId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    }
  } catch {
    // Ignore
  }
  return null;
}

/**
 * Speichert Audio im Cache und gibt die öffentliche URL zurück
 */
function cacheAudio(cacheId: string, audio: ArrayBuffer): string {
  const safeId = cacheId.replace(/[^a-zA-Z0-9_-]/g, '');
  const cachePath = getCachePath(cacheId);
  const cacheDir = join(process.cwd(), TTS_CACHE.DIR);

  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }

  writeFileSync(cachePath, Buffer.from(audio));
  console.log(`[TTS Service] Cached: ${cacheId} (${audio.byteLength} bytes)`);

  return `${TTS_CACHE.PUBLIC_URL_PREFIX}/${safeId}`;
}

// ============================================
// ELEVENLABS GENERATOR
// ============================================

export async function generateElevenLabs(
  text: string,
  speed?: number,
): Promise<ArrayBuffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY ist nicht konfiguriert');
  }

  const voiceId = ELEVENLABS_CONFIG.VOICE_ID;
  const modelId = ELEVENLABS_CONFIG.DEFAULT_MODEL;
  const outputFormat = ELEVENLABS_CONFIG.OUTPUT_FORMAT;

  const voiceSettings = {
    ...ELEVENLABS_CONFIG.VOICE_SETTINGS,
    ...(speed !== undefined ? { speed } : {}),
  };

  const url = `${ELEVENLABS_CONFIG.API_BASE_URL}/v1/text-to-speech/${voiceId}?output_format=${outputFormat}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      language_code: ELEVENLABS_CONFIG.LANGUAGE_CODE,
      voice_settings: voiceSettings,
    }),
    signal: AbortSignal.timeout(TTS_CONFIG.REQUEST_TIMEOUT),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    console.error(`[TTS Service] ElevenLabs Error ${response.status}:`, errorBody);
    throw new Error(
      `ElevenLabs API Error ${response.status}: ${errorBody || 'Unbekannt'}`
    );
  }

  return await response.arrayBuffer();
}

// ============================================
// IN-FLIGHT DEDUPLICATION
// ============================================

/**
 * Verhindert parallele Generierung für die gleiche cacheId.
 * Wenn z.B. startQuestion und broadcastRoomUpdate gleichzeitig passieren,
 * wird nur 1 API-Call gemacht.
 */
const inFlightRequests = new Map<string, Promise<string | null>>();

// ============================================
// MAIN API
// ============================================

/**
 * Generiert TTS-Audio und cached es als statische Datei.
 *
 * @param text - Der vorzulesende Text
 * @param cacheId - Eindeutige ID für den Cache (z.B. question.id)
 * @returns URL der gecachten Datei, oder null bei Fehler
 */
export async function generateAndCache(
  text: string,
  cacheId: string,
): Promise<string | null> {
  // 1. Cache check
  const existingUrl = getCachedUrl(cacheId);
  if (existingUrl) return existingUrl;

  // 2. Deduplication: If already generating for this cacheId, wait for that
  const inFlight = inFlightRequests.get(cacheId);
  if (inFlight) {
    console.log(`[TTS Service] Dedup: waiting for in-flight ${cacheId}`);
    return inFlight;
  }

  // 3. Generate
  const promise = (async (): Promise<string | null> => {
    try {
      const sanitizedText = text.slice(0, TTS_CONFIG.MAX_TEXT_LENGTH);
      console.log(`[TTS Service] Generating: ${cacheId} (${sanitizedText.length} chars)`);

      let audioBuffer: ArrayBuffer;

      if (TTS_PROVIDER === 'elevenlabs') {
        audioBuffer = await generateElevenLabs(sanitizedText);
      } else {
        // OpenAI — for now just import dynamically to avoid bundling issues
        throw new Error('OpenAI TTS not supported in server-side service (use ElevenLabs)');
      }

      const url = cacheAudio(cacheId, audioBuffer);
      return url;
    } catch (error) {
      console.error(`[TTS Service] Error generating ${cacheId}:`, error);
      return null;
    } finally {
      inFlightRequests.delete(cacheId);
    }
  })();

  inFlightRequests.set(cacheId, promise);
  return promise;
}
