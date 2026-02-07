import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateQuestionHash } from '@/lib/utils';

interface ImportQuestion {
  type: string;
  difficulty: string;
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
  _translated?: boolean;
  _originalQuestion?: string; // Original English question for duplicate detection
  _originalCorrectAnswer?: string;
  _originalIncorrectAnswers?: string[];
}

// POST /api/admin/import-batch - Import multiple questions at once
export async function POST(request: NextRequest) {
  try {
    const { questions, categoryId, source = 'opentdb_gui' } = await request.json();

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json(
        { error: 'Keine Fragen zum Importieren' },
        { status: 400 }
      );
    }

    if (!categoryId) {
      return NextResponse.json(
        { error: 'Kategorie fehlt' },
        { status: 400 }
      );
    }

    // Verify category exists
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      return NextResponse.json(
        { error: 'Kategorie nicht gefunden' },
        { status: 400 }
      );
    }

    let added = 0;
    let skipped = 0;
    let failed = 0;
    const errors: string[] = [];

    // Use a transaction to ensure atomicity:
    // Either all questions + import log are created, or none
    await prisma.$transaction(async (tx) => {
      // Process each question
      for (const q of questions as ImportQuestion[]) {
        try {
          // Debug: Log if _originalQuestion is present
          console.log('[Import] Question:', q.question.substring(0, 50), '| _originalQuestion:', q._originalQuestion?.substring(0, 50) || 'NOT SET');
          
          // Map OpenTDB type to our type
          const questionType = q.type === 'boolean' ? 'TRUE_FALSE' : 'MULTIPLE_CHOICE';
          
          // Map difficulty
          const difficultyMap: Record<string, string> = {
            easy: 'EASY',
            medium: 'MEDIUM',
            hard: 'HARD',
          };
          const difficulty = difficultyMap[q.difficulty.toLowerCase()] || 'MEDIUM';

          // Build content based on type
          // Also store original English text for duplicate detection
          let content: any;
          if (questionType === 'TRUE_FALSE') {
            content = {
              correctAnswer: q.correct_answer.toLowerCase() === 'true',
            };
          } else {
            content = {
              correctAnswer: q.correct_answer,
              incorrectAnswers: q.incorrect_answers,
            };
          }
          
          // Store original English text if available (for duplicate detection later)
          if (q._originalQuestion) {
            content._originalQuestion = q._originalQuestion;
          }

          // Generate a unique external ID based on ORIGINAL question content (English)
          // This ensures we can detect duplicates even after translation
          const originalText = q._originalQuestion || q.question;
          const externalId = generateQuestionHash(originalText);

          // Check for duplicates
          const existing = await tx.question.findFirst({
            where: {
              OR: [
                { source, externalId },
                { text: q.question, categoryId },
              ],
            },
          });

          if (existing) {
            skipped++;
            continue;
          }

          // Create the question
          await tx.question.create({
            data: {
              categoryId,
              text: q.question,
              type: questionType as any,
              difficulty: difficulty as any,
              content,
              source,
              externalId,
              isVerified: false, // Imported questions need verification
              isActive: true,
            },
          });

          added++;
        } catch (err) {
          failed++;
          errors.push(`Frage "${q.question.substring(0, 50)}...": ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`);
        }
      }

      // Log the import (inside transaction for atomicity)
      await tx.importLog.create({
        data: {
          source,
          filename: `gui_import_${new Date().toISOString()}`,
          questionsAdded: added,
          questionsSkipped: skipped,
          questionsFailed: failed,
          details: {
            categoryId,
            categoryName: category.name,
            errors: errors.slice(0, 10), // Only store first 10 errors
          },
        },
      });
    });

    return NextResponse.json({
      success: true,
      added,
      skipped,
      failed,
      errors: errors.slice(0, 5),
      message: `${added} Fragen importiert${skipped > 0 ? `, ${skipped} übersprungen (Duplikate)` : ''}${failed > 0 ? `, ${failed} fehlgeschlagen` : ''}`,
    });
  } catch (error) {
    console.error('Batch import error:', error);
    return NextResponse.json(
      { error: 'Import-Fehler: ' + (error instanceof Error ? error.message : 'Unbekannter Fehler') },
      { status: 500 }
    );
  }
}

// generateQuestionHash is now imported from @/lib/utils

