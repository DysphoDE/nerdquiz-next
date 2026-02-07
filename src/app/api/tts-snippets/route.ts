/**
 * API Route: GET /api/tts-snippets
 * 
 * Scannt den public/audio/tts/ Ordner und gibt alle MP3-Dateien
 * gruppiert nach Unterordner (Kategorie) zurück.
 * So müssen neue Snippets nicht manuell in der audioRegistry eingetragen werden.
 */

import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  const ttsDir = path.join(process.cwd(), 'public', 'audio', 'tts');

  try {
    // Alle Unterordner lesen
    const entries = fs.readdirSync(ttsDir, { withFileTypes: true });
    const categories: Record<string, string[]> = {};

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const categoryDir = path.join(ttsDir, entry.name);
      const files = fs.readdirSync(categoryDir)
        .filter((f) => f.toLowerCase().endsWith('.mp3'))
        .sort() // Alphabetisch sortieren für konsistente Reihenfolge
        .map((f) => `/audio/tts/${entry.name}/${f}`);

      if (files.length > 0) {
        categories[entry.name] = files;
      }
    }

    return NextResponse.json(categories, {
      headers: {
        // Cache für 60 Sekunden im Browser, aber immer revalidieren
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    console.error('[tts-snippets] Failed to scan TTS directory:', error);
    return NextResponse.json({}, { status: 200 });
  }
}
