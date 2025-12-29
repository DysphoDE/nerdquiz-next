/**
 * Database Seed Script
 * 
 * Migriert alle bestehenden JSON-Fragen in die Supabase-Datenbank.
 * 
 * Verwendung:
 *   npx tsx scripts/seed-database.ts
 *   
 * Oder über npm script:
 *   npm run db:seed
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

interface OldChoiceQuestion {
  question: string;
  answers: string[];
  correct: number;
}

interface OldEstimationQuestion {
  question: string;
  correctAnswer: number;
  unit: string;
}

interface OldCategoryData {
  name: string;
  icon: string;
  questions: OldChoiceQuestion[];
  estimationQuestions?: OldEstimationQuestion[];
}

// ============================================
// HELPERS
// ============================================

/**
 * Erstellt einen URL-freundlichen Slug aus einem Namen
 */
function createSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[äÄ]/g, 'ae')
    .replace(/[öÖ]/g, 'oe')
    .replace(/[üÜ]/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Konvertiert alte Choice-Frage ins neue Format
 */
function convertChoiceQuestion(old: OldChoiceQuestion) {
  const correctAnswer = old.answers[old.correct];
  const incorrectAnswers = old.answers.filter((_, i) => i !== old.correct);
  
  return {
    text: old.question,
    type: QuestionType.MULTIPLE_CHOICE,
    difficulty: Difficulty.MEDIUM, // Default, kann später angepasst werden
    content: {
      correctAnswer,
      incorrectAnswers,
    },
  };
}

/**
 * Konvertiert alte Estimation-Frage ins neue Format
 */
function convertEstimationQuestion(old: OldEstimationQuestion) {
  return {
    text: old.question,
    type: QuestionType.ESTIMATION,
    difficulty: Difficulty.MEDIUM,
    content: {
      correctValue: old.correctAnswer,
      unit: old.unit,
    },
  };
}

// ============================================
// MAIN SEED FUNCTION
// ============================================

async function main() {
  console.log('🌱 Starting database seed...\n');
  
  const categoriesDir = path.join(process.cwd(), 'data', 'categories');
  
  // Check if directory exists
  if (!fs.existsSync(categoriesDir)) {
    console.error('❌ Categories directory not found:', categoriesDir);
    process.exit(1);
  }
  
  const files = fs.readdirSync(categoriesDir).filter(f => f.endsWith('.json'));
  console.log(`📂 Found ${files.length} category files\n`);
  
  let totalQuestions = 0;
  let totalCategories = 0;
  
  for (const file of files) {
    const filePath = path.join(categoriesDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const data: OldCategoryData = JSON.parse(content);
    
    const slug = file.replace('.json', '');
    
    console.log(`📚 Processing: ${data.name} (${slug})`);
    
    // Upsert Category
    const category = await prisma.category.upsert({
      where: { slug },
      update: {
        name: data.name,
        icon: data.icon,
      },
      create: {
        slug,
        name: data.name,
        icon: data.icon,
        isActive: true,
      },
    });
    
    totalCategories++;
    
    // Convert and insert choice questions
    const choiceQuestions = data.questions.map(q => ({
      ...convertChoiceQuestion(q),
      categoryId: category.id,
      source: 'json_migration',
      isVerified: true,
      isActive: true,
    }));
    
    // Convert and insert estimation questions
    const estimationQuestions = (data.estimationQuestions || []).map(q => ({
      ...convertEstimationQuestion(q),
      categoryId: category.id,
      source: 'json_migration',
      isVerified: true,
      isActive: true,
    }));
    
    const allQuestions = [...choiceQuestions, ...estimationQuestions];
    
    // Delete existing questions from this category (to avoid duplicates on re-run)
    await prisma.question.deleteMany({
      where: {
        categoryId: category.id,
        source: 'json_migration',
      },
    });
    
    // Insert all questions
    if (allQuestions.length > 0) {
      await prisma.question.createMany({
        data: allQuestions,
      });
    }
    
    console.log(`   ✓ ${choiceQuestions.length} choice, ${estimationQuestions.length} estimation questions`);
    totalQuestions += allQuestions.length;
  }
  
  // Log import
  await prisma.importLog.create({
    data: {
      source: 'json_migration',
      questionsAdded: totalQuestions,
      questionsSkipped: 0,
      questionsFailed: 0,
      details: {
        categories: totalCategories,
        files: files,
      },
    },
  });
  
  console.log('\n✅ Seed completed!');
  console.log(`   📊 ${totalCategories} categories`);
  console.log(`   ❓ ${totalQuestions} questions`);
}

// ============================================
// RUN
// ============================================

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

