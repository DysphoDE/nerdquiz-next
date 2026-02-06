/**
 * TTS API Route
 * 
 * Generiert Sprach-Audio aus Text via OpenAI TTS.
 * Nutzt das Vercel AI SDK mit @ai-sdk/openai Provider.
 * 
 * POST /api/tts
 * Body: { text: string, voice?: string, model?: string, instructions?: string, speed?: number }
 * Response: Audio binary (audio/mpeg)
 */

import { NextRequest, NextResponse } from 'next/server';
import { experimental_generateSpeech as generateSpeech } from 'ai';
import { openai } from '@ai-sdk/openai';
import {
  TTS_CONFIG,
  TTS_INSTRUCTIONS,
  type TtsVoice,
  type TtsModel,
  type TtsInstructionKey,
} from '@/config/constants/tts';

// ============================================
// TYPES
// ============================================

interface TtsRequestBody {
  /** Der vorzulesende Text */
  text: string;
  /** OpenAI Voice ID (default: aus TTS_CONFIG) */
  voice?: TtsVoice;
  /** OpenAI TTS Model (default: aus TTS_CONFIG) */
  model?: TtsModel;
  /** Freitext-Instructions für die Stimme (nur gpt-4o-mini-tts) */
  instructions?: string;
  /** Vordefinierter Instruction-Key aus TTS_INSTRUCTIONS */
  instructionKey?: TtsInstructionKey;
  /** Sprechgeschwindigkeit 0.25 - 4.0 (default: 1.0) */
  speed?: number;
}

// ============================================
// ROUTE HANDLER
// ============================================

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body: TtsRequestBody = await request.json();
    const {
      text,
      voice = TTS_CONFIG.DEFAULT_VOICE,
      model = TTS_CONFIG.DEFAULT_MODEL,
      instructions,
      instructionKey,
      speed = TTS_CONFIG.DEFAULT_SPEED,
    } = body;

    // ---- Validation ----
    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Text ist erforderlich' },
        { status: 400 }
      );
    }

    // Truncate text if too long
    const sanitizedText = text.slice(0, TTS_CONFIG.MAX_TEXT_LENGTH);

    // Resolve instructions: explicit string > instructionKey > default QUESTION
    let resolvedInstructions: string | undefined;
    if (instructions) {
      resolvedInstructions = instructions;
    } else if (instructionKey && TTS_INSTRUCTIONS[instructionKey]) {
      resolvedInstructions = TTS_INSTRUCTIONS[instructionKey];
    } else {
      resolvedInstructions = TTS_INSTRUCTIONS.QUESTION;
    }

    // ---- Generate Speech ----
    const result = await generateSpeech({
      model: openai.speech(model),
      text: sanitizedText,
      voice,
      instructions: resolvedInstructions,
      speed,
      outputFormat: TTS_CONFIG.OUTPUT_FORMAT,
      maxRetries: TTS_CONFIG.MAX_RETRIES,
      abortSignal: AbortSignal.timeout(TTS_CONFIG.REQUEST_TIMEOUT),
    });

    // ---- Return Audio ----
    const audioBuffer = result.audio.uint8Array;

    return new NextResponse(Buffer.from(audioBuffer), {
      status: 200,
      headers: {
        'Content-Type': result.audio.mediaType || 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
        'Cache-Control': 'public, max-age=3600', // Cache für 1 Stunde
      },
    });
  } catch (error) {
    console.error('[TTS API] Error:', error);

    // Differentiate between timeout and other errors
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
