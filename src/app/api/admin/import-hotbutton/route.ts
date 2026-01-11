/**
 * API Route: Hot Button Batch Import
 * 
 * Importiert Hot Button Fragen aus JSON-Format in die Datenbank.
 * Unterstützt automatisches Kategorie-Matching basierend auf Slugs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { 
  HotButtonImportSchema, 
  type HotButtonImportQuestion 
} from '@/lib/validations/questions';

// Initialize Prisma
let prisma: PrismaClient | null = null;

try {
  if (process.env.DATABASE_URL) {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new PrismaPg(pool);
    prisma = new PrismaClient({ adapter });
  }
} catch (error) {
  console.error('Failed to initialize Prisma:', error);
}

/**
 * POST /api/admin/import-hotbutton
 * 
 * Body: {
 *   questions: HotButtonImportQuestion[],
 *   defaultCategoryId?: string  // Fallback category if no match found
 * }
 */
export async function POST(request: NextRequest) {
  if (!prisma) {
    return NextResponse.json(
      { error: 'Datenbank nicht verfügbar' },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    
    // Validate input
    const validation = HotButtonImportSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Ungültige Daten', 
          details: validation.error.issues 
        },
        { status: 400 }
      );
    }

    const { questions } = validation.data;

    let added = 0;
    let failed = 0;
    const errors: string[] = [];

    // Process each question
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      
      try {
        // Get category ID (prefer direct categoryId, fallback to category slug matching)
        const categoryId = q.categoryId;

        if (!categoryId) {
          errors.push(`Frage ${i + 1}: Keine Kategorie angegeben`);
          failed++;
          continue;
        }

        // Build accepted answers (include correctAnswer if not in list)
        const acceptedAnswers = q.acceptedAnswers && q.acceptedAnswers.length > 0
          ? [q.correctAnswer, ...q.acceptedAnswers.filter(a => a !== q.correctAnswer)]
          : [q.correctAnswer];

        // Create Hot Button content
        const content = {
          correctAnswer: q.correctAnswer,
          acceptedAnswers,
          revealSpeed: 50, // Always use default
        };

        // Insert into database
        await prisma.question.create({
          data: {
            categoryId,
            text: q.text,
            type: 'HOT_BUTTON',
            difficulty: q.difficulty || 'MEDIUM',
            content,
            source: 'hot_button_import',
            isVerified: false,
            isActive: true,
          },
        });

        added++;
      } catch (error) {
        console.error(`Failed to import question ${i + 1}:`, error);
        errors.push(`Frage ${i + 1}: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
        failed++;
      }
    }

    // Log import
    try {
      await prisma.importLog.create({
        data: {
          source: 'hot_button_import',
          filename: 'json_paste',
          questionsAdded: added,
          questionsSkipped: 0,
          questionsFailed: failed,
          details: {
            totalQuestions: questions.length,
            errors: errors.length > 0 ? errors : undefined,
          },
        },
      });
    } catch (logError) {
      console.error('Failed to create import log:', logError);
    }

    return NextResponse.json({
      success: true,
      message: `${added} Hot Button Fragen erfolgreich importiert`,
      added,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error) {
    console.error('Hot Button import error:', error);
    return NextResponse.json(
      { 
        error: 'Import fehlgeschlagen', 
        details: error instanceof Error ? error.message : 'Unbekannter Fehler' 
      },
      { status: 500 }
    );
  }
}

