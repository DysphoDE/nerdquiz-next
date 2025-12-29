/**
 * Question Loader
 * 
 * Lädt Fragen aus der Datenbank für den Game-Server.
 * Falls keine DB-Verbindung besteht, fällt es auf die JSON-Files zurück.
 */

import { PrismaClient, QuestionType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { 
  isMultipleChoiceContent, 
  isEstimationContent,
  type MultipleChoiceContent,
  type EstimationContent,
} from '@/lib/validations/questions';

// Initialize Prisma Client for server (Prisma 7 with adapter)
let prisma: PrismaClient | null = null;

try {
  if (process.env.DATABASE_URL) {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new PrismaPg(pool);
    prisma = new PrismaClient({ adapter });
  }
} catch (error) {
  console.warn('⚠️ Database not configured, using JSON fallback');
}

// ============================================
// TYPES
// ============================================

interface CategoryInfo {
  id: string;
  name: string;
  icon: string;
  questionCount: number;
}

interface GameQuestion {
  id: string;
  text: string;
  type: 'choice' | 'estimation';
  answers?: string[];
  correctIndex?: number;
  correctValue?: number;
  unit?: string;
  category: string;
  categoryIcon: string;
}

// ============================================
// JSON FALLBACK (existing implementation)
// ============================================

interface OldQuestionData {
  question: string;
  answers?: string[];
  correct?: number;
  correctAnswer?: number;
  unit?: string;
}

interface OldCategoryData {
  name: string;
  icon: string;
  questions: OldQuestionData[];
  estimationQuestions?: OldQuestionData[];
}

let jsonCategoriesCache: Map<string, OldCategoryData> | null = null;

function loadJsonCategories(): Map<string, OldCategoryData> {
  if (jsonCategoriesCache) return jsonCategoriesCache;

  const categoriesDir = path.join(process.cwd(), 'data', 'categories');
  const categories = new Map<string, OldCategoryData>();

  try {
    if (fs.existsSync(categoriesDir)) {
      const files = fs.readdirSync(categoriesDir);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(categoriesDir, file);
          const content = fs.readFileSync(filePath, 'utf-8');
          const data: OldCategoryData = JSON.parse(content);
          const id = file.replace('.json', '');
          categories.set(id, data);
        }
      }
    }
  } catch (error) {
    console.error('Error loading JSON categories:', error);
  }

  jsonCategoriesCache = categories;
  return categories;
}

function getJsonCategoryList(): CategoryInfo[] {
  const categories = loadJsonCategories();
  const list: CategoryInfo[] = [];

  categories.forEach((data, id) => {
    list.push({
      id,
      name: data.name,
      icon: data.icon,
      questionCount: data.questions.length + (data.estimationQuestions?.length || 0),
    });
  });

  return list.sort((a, b) => a.name.localeCompare(b.name));
}

function getJsonRandomQuestions(categoryId: string, count: number): GameQuestion[] {
  const categories = loadJsonCategories();
  const category = categories.get(categoryId);

  if (!category) return [];

  const allQuestions = [...category.questions];
  if (category.estimationQuestions) {
    allQuestions.push(...category.estimationQuestions);
  }

  const choiceQuestions = allQuestions.filter(q => q.answers !== undefined && q.answers.length > 0);
  const estimationQuestions = allQuestions.filter(q => q.correctAnswer !== undefined);
  
  const shuffledChoice = [...choiceQuestions].sort(() => Math.random() - 0.5);
  const shuffledEstimation = [...estimationQuestions].sort(() => Math.random() - 0.5);
  
  const selectedChoice = shuffledChoice.slice(0, count - 1);
  const selectedEstimation = shuffledEstimation.slice(0, 1);
  
  const selected = selectedEstimation.length > 0 
    ? [...selectedChoice, ...selectedEstimation]
    : shuffledChoice.slice(0, count);

  return selected.map((q, i) => {
    const isEstimation = q.correctAnswer !== undefined;
    
    return {
      id: `q_${Date.now()}_${i}`,
      text: q.question,
      type: isEstimation ? 'estimation' : 'choice',
      answers: q.answers,
      correctIndex: q.correct,
      correctValue: q.correctAnswer,
      unit: q.unit || '',
      category: category.name,
      categoryIcon: category.icon,
    } as GameQuestion;
  });
}

// ============================================
// DATABASE IMPLEMENTATION
// ============================================

async function getDbCategoryList(): Promise<CategoryInfo[]> {
  if (!prisma) return [];

  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      _count: {
        select: { 
          questions: { 
            where: { isActive: true } 
          } 
        },
      },
    },
  });

  return categories.map(cat => ({
    id: cat.slug, // Use slug as ID for compatibility
    name: cat.name,
    icon: cat.icon,
    questionCount: cat._count.questions,
  }));
}

async function getDbRandomQuestions(categorySlug: string, count: number): Promise<GameQuestion[]> {
  if (!prisma) return [];

  // Find category by slug
  const category = await prisma.category.findUnique({
    where: { slug: categorySlug },
  });

  if (!category) {
    console.log(`❌ Category not found: ${categorySlug}`);
    return [];
  }

  // Get questions with random ordering
  // PostgreSQL random ordering
  const choiceQuestions = await prisma.question.findMany({
    where: {
      categoryId: category.id,
      isActive: true,
      type: { in: ['MULTIPLE_CHOICE', 'TRUE_FALSE'] },
    },
    orderBy: {
      // Use raw SQL for random - this is a workaround
      createdAt: 'desc',
    },
    take: count * 2, // Get more than needed for shuffling
  });

  const estimationQuestions = await prisma.question.findMany({
    where: {
      categoryId: category.id,
      isActive: true,
      type: 'ESTIMATION',
    },
    take: 5,
  });

  // Shuffle in JS
  const shuffledChoice = [...choiceQuestions].sort(() => Math.random() - 0.5);
  const shuffledEstimation = [...estimationQuestions].sort(() => Math.random() - 0.5);

  // Take (count - 1) choice + 1 estimation
  const selectedChoice = shuffledChoice.slice(0, count - 1);
  const selectedEstimation = shuffledEstimation.slice(0, 1);
  
  const selected = selectedEstimation.length > 0 
    ? [...selectedChoice, ...selectedEstimation]
    : shuffledChoice.slice(0, count);

  // Update timesPlayed
  await prisma.question.updateMany({
    where: { id: { in: selected.map(q => q.id) } },
    data: { timesPlayed: { increment: 1 } },
  });

  // Convert to GameQuestion format
  return selected.map((q, i) => {
    const content = q.content as any;
    const isEstimation = q.type === 'ESTIMATION';
    
    if (isEstimation && isEstimationContent(content)) {
      return {
        id: q.id,
        text: q.text,
        type: 'estimation' as const,
        correctValue: content.correctValue,
        unit: content.unit,
        category: category.name,
        categoryIcon: category.icon,
        explanation: q.explanation || undefined,
      };
    }
    
    if (isMultipleChoiceContent(content)) {
      // Shuffle answers and track correct index
      const allAnswers = [content.correctAnswer, ...content.incorrectAnswers];
      const shuffledAnswers = [...allAnswers].sort(() => Math.random() - 0.5);
      const correctIndex = shuffledAnswers.indexOf(content.correctAnswer);

      return {
        id: q.id,
        text: q.text,
        type: 'choice' as const,
        answers: shuffledAnswers,
        correctIndex,
        category: category.name,
        categoryIcon: category.icon,
        explanation: q.explanation || undefined,
      };
    }

    // Fallback
    return {
      id: q.id,
      text: q.text,
      type: 'choice' as const,
      answers: ['Option A', 'Option B', 'Option C', 'Option D'],
      correctIndex: 0,
      category: category.name,
      categoryIcon: category.icon,
      explanation: q.explanation || undefined,
    };
  });
}

// ============================================
// EXPORTED FUNCTIONS (with fallback)
// ============================================

/**
 * Get all available categories
 */
export async function getCategoryList(): Promise<CategoryInfo[]> {
  if (prisma) {
    try {
      const dbCategories = await getDbCategoryList();
      if (dbCategories.length > 0) {
        console.log(`📊 Loaded ${dbCategories.length} categories from database`);
        return dbCategories;
      }
    } catch (error) {
      console.warn('⚠️ Database query failed, using JSON fallback');
    }
  }
  
  const jsonCategories = getJsonCategoryList();
  console.log(`📂 Loaded ${jsonCategories.length} categories from JSON`);
  return jsonCategories;
}

/**
 * Get random categories for voting
 */
export async function getRandomCategoriesForVoting(count: number = 6): Promise<CategoryInfo[]> {
  const allCategories = await getCategoryList();
  const shuffled = [...allCategories].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Get random questions from a category
 */
export async function getRandomQuestions(categoryId: string, count: number): Promise<GameQuestion[]> {
  if (prisma) {
    try {
      const dbQuestions = await getDbRandomQuestions(categoryId, count);
      if (dbQuestions.length > 0) {
        console.log(`📊 Loaded ${dbQuestions.length} questions from database`);
        return dbQuestions;
      }
    } catch (error) {
      console.warn('⚠️ Database query failed, using JSON fallback');
    }
  }
  
  const jsonQuestions = getJsonRandomQuestions(categoryId, count);
  console.log(`📂 Loaded ${jsonQuestions.length} questions from JSON`);
  return jsonQuestions;
}

/**
 * Check if database is connected
 */
export async function isDatabaseConnected(): Promise<boolean> {
  if (!prisma) return false;
  
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/**
 * Get category data by ID/slug
 */
export async function getCategoryData(categoryId: string): Promise<{ name: string; icon: string } | null> {
  if (prisma) {
    try {
      const category = await prisma.category.findFirst({
        where: { 
          OR: [
            { slug: categoryId },
            { id: categoryId },
          ],
        },
      });
      if (category) {
        return { name: category.name, icon: category.icon };
      }
    } catch {
      // Fall through to JSON
    }
  }
  
  const jsonCategories = loadJsonCategories();
  const jsonCategory = jsonCategories.get(categoryId);
  if (jsonCategory) {
    return { name: jsonCategory.name, icon: jsonCategory.icon };
  }
  
  return null;
}

