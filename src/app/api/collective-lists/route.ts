/**
 * API Route: GET /api/collective-lists
 *
 * Gibt alle aktiven COLLECTIVE_LIST-Fragen aus der Datenbank zurück.
 * Wird vom Custom Game Configurator verwendet, damit Spieler
 * eine spezifische Liste für Listen-Runden auswählen können.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

interface CollectiveListInfo {
  id: string;
  topic: string;
  itemCount: number;
  category?: string;
  categoryIcon?: string;
}

export async function GET() {
  if (!prisma) {
    return NextResponse.json([] as CollectiveListInfo[], {
      headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
    });
  }

  try {
    const questions = await prisma.question.findMany({
      where: {
        type: 'COLLECTIVE_LIST',
        isActive: true,
      },
      include: {
        category: {
          select: { name: true, icon: true },
        },
      },
      orderBy: { text: 'asc' },
    });

    const lists: CollectiveListInfo[] = questions.map((q) => {
      const content = q.content as any;
      return {
        id: q.id,
        topic: content?.topic || q.text,
        itemCount: Array.isArray(content?.items) ? content.items.length : 0,
        category: q.category?.name,
        categoryIcon: q.category?.icon,
      };
    });

    return NextResponse.json(lists, {
      headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    console.error('[collective-lists] Failed to load lists:', error);
    return NextResponse.json([] as CollectiveListInfo[], { status: 200 });
  }
}
