/**
 * TTS API Route
 *
 * Generiert Sprach-Audio aus Text.
 * Unterstützt zwei Provider: OpenAI TTS (Vercel AI SDK) und ElevenLabs.
 * Der aktive Provider wird über TTS_PROVIDER in der Config gesteuert.
 *
 * Wenn eine questionId mitgeschickt wird und TTS_CACHE aktiviert ist,
 * wird die generierte MP3 auf dem Server gecacht. Bei erneutem Aufruf
 * mit derselben questionId wird die gecachte Datei ausgeliefert (kein API-Call).
 *
 * HINWEIS: Die primäre TTS-Generierung läuft jetzt über den Server
 * (ttsService.ts). Diese Route bleibt als Fallback/Dev-Zwecke erhalten.
 *
 * POST /api/tts
 * Body: { text: string, questionId?: string, voice?: string, model?: string, ... }
 * Response: Audio binary (audio/mpeg)
 */

import { NextRequest, NextResponse } from 'next/server';
import { experimental_generateSpeech as generateSpeech } from 'ai';
import { openai } from '@ai-sdk/openai';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  TTS_PROVIDER,
  TTS_CONFIG,
  TTS_INSTRUCTIONS,
  TTS_CACHE,
  type TtsVoice,
  type TtsModel,
  type TtsInstructionKey,
} from '@/config/constants/tts';
import { generateElevenLabs } from '@/server/ttsService';

// ============================================
// TYPES
// ============================================

interface TtsRequestBody {
  /** Der vorzulesende Text */
  text: string;
  /** Frage-ID für Caching */
  questionId?: string;
  /** OpenAI Voice ID (default: aus TTS_CONFIG) */
  voice?: TtsVoice;
  /** OpenAI TTS Model (default: aus TTS_CONFIG) */
  model?: TtsModel;
  /** Freitext-Instructions für die Stimme (nur OpenAI gpt-4o-mini-tts) */
  instructions?: string;
  /** Vordefinierter Instruction-Key aus TTS_INSTRUCTIONS */
  instructionKey?: TtsInstructionKey;
  /** Sprechgeschwindigkeit (default: 1.0) */
  speed?: number;
}

// ============================================
// CACHE HELPERS (HTTP route returns raw audio)
// ============================================

function getCachePath(questionId: string): string {
  const safeId = questionId.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeId) throw new Error('Ungültige questionId');
  return join(process.cwd(), TTS_CACHE.DIR, `${safeId}.mp3`);
}

function getCachedAudio(questionId: string): ArrayBuffer | null {
  if (!TTS_CACHE.ENABLED) return null;

  try {
    const cachePath = getCachePath(questionId);
    if (existsSync(cachePath)) {
      console.log(`[TTS API] Cache HIT für questionId: ${questionId}`);
      const buf = readFileSync(cachePath);
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    }
  } catch {
    // Ignore cache errors, fall through to generation
  }
  return null;
}

function cacheAudio(questionId: string, audio: ArrayBuffer): void {
  if (!TTS_CACHE.ENABLED) return;

  try {
    const cachePath = getCachePath(questionId);
    const cacheDir = join(process.cwd(), TTS_CACHE.DIR);

    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true });
    }

    writeFileSync(cachePath, Buffer.from(audio));
    console.log(`[TTS API] Cached audio für questionId: ${questionId} (${audio.byteLength} bytes)`);
  } catch (error) {
    console.warn('[TTS API] Cache write failed:', error);
  }
}

// ============================================
// OPENAI TTS
// ============================================

async function generateOpenAI(
  text: string,
  voice: TtsVoice,
  model: TtsModel,
  resolvedInstructions: string | undefined,
  speed: number,
): Promise<ArrayBuffer> {
  const result = await generateSpeech({
    model: openai.speech(model),
    text,
    voice,
    instructions: resolvedInstructions,
    speed,
    outputFormat: TTS_CONFIG.OUTPUT_FORMAT,
    maxRetries: TTS_CONFIG.MAX_RETRIES,
    abortSignal: AbortSignal.timeout(TTS_CONFIG.REQUEST_TIMEOUT),
  });

  const u8 = result.audio.uint8Array;
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

// ============================================
// ROUTE HANDLER
// ============================================

export async function POST(request: NextRequest) {
  try {
    const body: TtsRequestBody = await request.json();
    const {
      text,
      questionId,
      voice = TTS_CONFIG.DEFAULT_VOICE,
      model = TTS_CONFIG.DEFAULT_MODEL,
      instructions,
      instructionKey,
      speed = TTS_CONFIG.DEFAULT_SPEED,
    } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Text ist erforderlich' },
        { status: 400 }
      );
    }

    // ---- Cache Check ----
    if (questionId) {
      const cached = getCachedAudio(questionId);
      if (cached) {
        return new Response(cached, {
          status: 200,
          headers: {
            'Content-Type': 'audio/mpeg',
            'Content-Length': cached.byteLength.toString(),
            'Cache-Control': 'public, max-age=31536000, immutable',
            'X-TTS-Cache': 'HIT',
          },
        });
      }
    }

    const sanitizedText = text.slice(0, TTS_CONFIG.MAX_TEXT_LENGTH);

    // ---- Generate Audio ----
    let audioBuffer: ArrayBuffer;

    if (TTS_PROVIDER === 'elevenlabs') {
      audioBuffer = await generateElevenLabs(sanitizedText, speed);
    } else {
      let resolvedInstructions: string | undefined;
      if (instructions) {
        resolvedInstructions = instructions;
      } else if (instructionKey && TTS_INSTRUCTIONS[instructionKey]) {
        resolvedInstructions = TTS_INSTRUCTIONS[instructionKey];
      } else {
        resolvedInstructions = TTS_INSTRUCTIONS.QUESTION;
      }
      audioBuffer = await generateOpenAI(sanitizedText, voice, model, resolvedInstructions, speed);
    }

    // ---- Cache Write ----
    if (questionId) {
      cacheAudio(questionId, audioBuffer);
    }

    return new Response(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
        'Cache-Control': questionId
          ? 'public, max-age=31536000, immutable'
          : 'public, max-age=3600',
        'X-TTS-Cache': 'MISS',
      },
    });
  } catch (error) {
    console.error('[TTS API] Error:', error);

    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'TTS-Request Timeout' },
        { status: 504 }
      );
    }

    return NextResponse.json(
      {
        error: 'TTS-Generierung fehlgeschlagen',
        details: error instanceof Error ? error.message : 'Unbekannter Fehler',
      },
      { status: 500 }
    );
  }
}
