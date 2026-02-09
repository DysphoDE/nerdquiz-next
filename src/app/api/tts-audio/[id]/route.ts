import { NextRequest, NextResponse } from 'next/server';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { TTS_CACHE } from '@/config/constants/tts';

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/tts-audio/[id]
 *
 * Serviert gecachte TTS-Audiodateien direkt über eine API-Route.
 * Umgeht damit Probleme mit statischem File-Serving (Reverse-Proxy, Next.js public/).
 */
export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;

  // Sanitize ID (same logic as ttsService)
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeId) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const filePath = join(process.cwd(), TTS_CACHE.DIR, `${safeId}.mp3`);

  if (!existsSync(filePath)) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const fileBuffer = readFileSync(filePath);

  return new NextResponse(fileBuffer, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(fileBuffer.length),
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
