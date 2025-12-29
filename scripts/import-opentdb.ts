/**
 * OpenTDB Import Script
 * 
 * Importiert Fragen aus OpenTDB JSON-Exports in die Datenbank.
 * 
 * Verwendung:
 *   npx tsx scripts/import-opentdb.ts <json-file> [category-slug]
 *   
 * Beispiel:
 *   npx tsx scripts/import-opentdb.ts opentdb_video_games.json gaming
 */

import { PrismaClient, QuestionType, Difficulty } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

// Prisma 7 requires an adapter for direct database connections
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ============================================
// TYPES
// ============================================

interface OpenTDBQuestion {
  type: 'multiple' | 'boolean';
  difficulty: 'easy' | 'medium' | 'hard';
  category: string;
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
}

// ============================================
// HELPERS
// ============================================

/**
 * Dekodiert HTML-Entities (OpenTDB nutzt diese)
 */
function decodeHTML(text: string): string {
  const entities: Record<string, string> = {
    '&quot;': '"',
    '&#039;': "'",
    '&apos;': "'",
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&ndash;': '–',
    '&mdash;': '—',
    '&hellip;': '…',
    '&eacute;': 'é',
    '&Eacute;': 'É',
    '&ouml;': 'ö',
    '&uuml;': 'ü',
    '&auml;': 'ä',
    '&Ouml;': 'Ö',
    '&Uuml;': 'Ü',
    '&Auml;': 'Ä',
    '&szlig;': 'ß',
  };
  
  let decoded = text;
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.replace(new RegExp(entity, 'g'), char);
  }
  
  // Numeric entities
  decoded = decoded.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
  
  return decoded;
}

/**
 * Mappt OpenTDB Difficulty auf unser Enum
 */
function mapDifficulty(diff: string): Difficulty {
  switch (diff.toLowerCase()) {
    case 'easy': return Difficulty.EASY;
    case 'hard': return Difficulty.HARD;
    default: return Difficulty.MEDIUM;
  }
}

/**
 * Konvertiert OpenTDB-Frage ins neue Format
 */
function convertOpenTDBQuestion(q: OpenTDBQuestion, categoryId: string) {
  const type = q.type === 'boolean' ? QuestionType.TRUE_FALSE : QuestionType.MULTIPLE_CHOICE;
  
  const content = type === QuestionType.TRUE_FALSE
    ? { correctAnswer: q.correct_answer.toLowerCase() === 'true' }
    : {
        correctAnswer: decodeHTML(q.correct_answer),
        incorrectAnswers: q.incorrect_answers.map(decodeHTML),
      };
  
  // Erstelle einen eindeutigen External ID aus dem Fragetext
  const externalId = Buffer.from(q.question).toString('base64').slice(0, 50);
  
  return {
    text: decodeHTML(q.question),
    type,
    difficulty: mapDifficulty(q.difficulty),
    content,
    categoryId,
    source: 'opentdb',
    externalId,
    isVerified: false, // OpenTDB-Fragen sollten geprüft werden
    isActive: true,
  };
}

// ============================================
// MAIN IMPORT FUNCTION
// ============================================

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log('Usage: npx tsx scripts/import-opentdb.ts <json-file> [category-slug]');
    console.log('Example: npx tsx scripts/import-opentdb.ts opentdb_video_games.json gaming');
    process.exit(1);
  }
  
  const jsonFile = args[0];
  const categorySlug = args[1];
  
  // Check if file exists
  const filePath = path.resolve(process.cwd(), jsonFile);
  if (!fs.existsSync(filePath)) {
    console.error('❌ File not found:', filePath);
    process.exit(1);
  }
  
  console.log('📥 Importing OpenTDB questions...\n');
  console.log(`   File: ${jsonFile}`);
  
  // Read and parse JSON
  const content = fs.readFileSync(filePath, 'utf-8');
  const questions: OpenTDBQuestion[] = JSON.parse(content);
  
  console.log(`   Found: ${questions.length} questions\n`);
  
  // Determine category
  let category;
  
  if (categorySlug) {
    // Use specified category
    category = await prisma.category.findUnique({
      where: { slug: categorySlug },
    });
    
    if (!category) {
      console.error(`❌ Category not found: ${categorySlug}`);
      console.log('\nAvailable categories:');
      const cats = await prisma.category.findMany({ select: { slug: true, name: true } });
      cats.forEach(c => console.log(`   - ${c.slug}: ${c.name}`));
      process.exit(1);
    }
  } else {
    // Try to determine from OpenTDB category or create new
    const opentdbCategory = questions[0]?.category || 'Imported';
    const slug = opentdbCategory
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    
    category = await prisma.category.upsert({
      where: { slug },
      update: {},
      create: {
        slug,
        name: opentdbCategory,
        icon: '❓',
        isActive: true,
      },
    });
    
    console.log(`   Category: ${category.name} (${category.slug})`);
  }
  
  console.log(`\n📚 Importing to category: ${category.name}\n`);
  
  let added = 0;
  let skipped = 0;
  let failed = 0;
  
  for (const q of questions) {
    try {
      const questionData = convertOpenTDBQuestion(q, category.id);
      
      // Try to insert, skip if duplicate (based on source + externalId)
      await prisma.question.upsert({
        where: {
          source_externalId: {
            source: 'opentdb',
            externalId: questionData.externalId!,
          },
        },
        update: {
          // Update existing
          text: questionData.text,
          difficulty: questionData.difficulty,
          content: questionData.content,
        },
        create: questionData,
      });
      
      added++;
    } catch (error: any) {
      if (error.code === 'P2002') {
        // Duplicate
        skipped++;
      } else {
        console.error(`   ❌ Failed: ${q.question.slice(0, 50)}...`);
        console.error(`      ${error.message}`);
        failed++;
      }
    }
  }
  
  // Log import
  await prisma.importLog.create({
    data: {
      source: 'opentdb',
      filename: jsonFile,
      questionsAdded: added,
      questionsSkipped: skipped,
      questionsFailed: failed,
      details: {
        categorySlug: category.slug,
        totalInFile: questions.length,
      },
    },
  });
  
  console.log('✅ Import completed!');
  console.log(`   ✓ Added: ${added}`);
  console.log(`   ⏭ Skipped (duplicates): ${skipped}`);
  if (failed > 0) {
    console.log(`   ❌ Failed: ${failed}`);
  }
}

// ============================================
// RUN
// ============================================

main()
  .catch((e) => {
    console.error('❌ Import failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

