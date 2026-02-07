/**
 * Question Loader
 * 
 * Lädt Fragen aus der Datenbank für den Game-Server.
 * Falls keine DB-Verbindung besteht, fällt es auf die JSON-Files zurück.
 * 
 * RANDOMIZATION IMPROVEMENTS (2025-01):
 * - Implemented Fisher-Yates shuffle for uniform distribution
 * - Removed createdAt sorting bias (was only selecting newest questions)
 * - Loads ALL questions from category for proper randomization
 * - Optimized Collective List queries with skip/take instead of loading all
 */

import { PrismaClient, QuestionType } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { prisma as sharedPrisma } from '@/lib/db';
import { 
  isMultipleChoiceContent, 
  isEstimationContent,
  type MultipleChoiceContent,
  type EstimationContent,
} from '@/lib/validations/questions';
import { 
  CATEGORY_LIMITS, 
  HOT_BUTTON_LIMITS, 
  HOT_BUTTON_SCORING,
  HOT_BUTTON_TIMING,
  COLLECTIVE_LIST_SCORING,
  COLLECTIVE_LIST_TIMING,
  BONUS_ROUND_THRESHOLDS,
  MATCHING,
} from '@/config/constants';
import type { GameQuestion, Difficulty } from './types';

// Use shared Prisma singleton from lib/db.ts
// Falls back to null if DATABASE_URL is not set
const prisma: PrismaClient | null = sharedPrisma || null;

// ============================================
// TYPES
// ============================================

interface CategoryInfo {
  id: string;
  name: string;
  icon: string;
  questionCount: number;
  multipleChoiceCount?: number;
  estimationCount?: number;
}

// ============================================
// SHUFFLE UTILITY (Fisher-Yates Algorithm)
// ============================================

/**
 * Fisher-Yates Shuffle Algorithm
 * Provides uniform distribution for array shuffling
 * Much better than .sort(() => Math.random() - 0.5)
 */
function fisherYatesShuffle<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// GameQuestion and Difficulty types are imported from ./types
// This ensures a single source of truth for these types

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
    const multipleChoiceCount = data.questions.length;
    const estimationCount = data.estimationQuestions?.length || 0;
    
    list.push({
      id,
      name: data.name,
      icon: data.icon,
      questionCount: multipleChoiceCount + estimationCount,
      multipleChoiceCount,
      estimationCount,
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
  
  // Use Fisher-Yates shuffle for better randomization
  const shuffledChoice = fisherYatesShuffle(choiceQuestions);
  const shuffledEstimation = fisherYatesShuffle(estimationQuestions);
  
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

  // Count questions by type for each category
  const categoriesWithCounts = await Promise.all(
    categories.map(async (cat) => {
      const multipleChoiceCount = await prisma!.question.count({
        where: {
          categoryId: cat.id,
          isActive: true,
          type: 'MULTIPLE_CHOICE',
        },
      });

      const estimationCount = await prisma!.question.count({
        where: {
          categoryId: cat.id,
          isActive: true,
          type: 'ESTIMATION',
        },
      });

      return {
        id: cat.slug, // Use slug as ID for compatibility
        name: cat.name,
        icon: cat.icon,
        questionCount: cat._count.questions,
        multipleChoiceCount,
        estimationCount,
      };
    })
  );

  return categoriesWithCounts;
}

async function getDbRandomQuestions(categorySlug: string, count: number, excludeIds: string[] = []): Promise<GameQuestion[]> {
  if (!prisma) return [];

  // Find category by slug
  const category = await prisma.category.findUnique({
    where: { slug: categorySlug },
  });

  if (!category) {
    console.log(`❌ Category not found: ${categorySlug}`);
    return [];
  }

  // Base filter excluding already used questions
  const baseFilter = {
    categoryId: category.id,
    isActive: true,
    ...(excludeIds.length > 0 && { id: { notIn: excludeIds } }),
  };

  // Get ALL questions from category (for proper randomization)
  // NOTE: TRUE_FALSE questions are excluded until properly implemented
  let choiceQuestions = await prisma.question.findMany({
    where: {
      ...baseFilter,
      type: 'MULTIPLE_CHOICE', // Only MULTIPLE_CHOICE for now (TRUE_FALSE not yet implemented)
    },
    // No orderBy needed - we'll shuffle in JavaScript with Fisher-Yates
  });

  let estimationQuestions = await prisma.question.findMany({
    where: {
      ...baseFilter,
      type: 'ESTIMATION',
    },
  });

  // If not enough questions and we were excluding, try without exclusion
  if (choiceQuestions.length < count - 1 && excludeIds.length > 0) {
    console.log('♻️ Not enough unused questions in category, resetting pool');
    choiceQuestions = await prisma.question.findMany({
      where: {
        categoryId: category.id,
        isActive: true,
        type: 'MULTIPLE_CHOICE', // Only MULTIPLE_CHOICE for now
      },
    });
    estimationQuestions = await prisma.question.findMany({
      where: {
        categoryId: category.id,
        isActive: true,
        type: 'ESTIMATION',
      },
    });
  }

  // Use Fisher-Yates shuffle for uniform random distribution
  const shuffledChoice = fisherYatesShuffle(choiceQuestions);
  const shuffledEstimation = fisherYatesShuffle(estimationQuestions);

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
    
    // Map DB difficulty enum to our type
    const difficulty = q.difficulty as Difficulty;
    
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
        difficulty,
      };
    }
    
    if (isMultipleChoiceContent(content)) {
      // Shuffle answers and track correct index
      const allAnswers = [content.correctAnswer, ...content.incorrectAnswers];
      const shuffledAnswers = fisherYatesShuffle(allAnswers);
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
        difficulty,
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
      difficulty,
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
 * Get categories suitable for normal rounds (with sufficient questions)
 * 
 * Filters categories to ensure they have enough questions for normal gameplay:
 * - At least MIN_MULTIPLE_CHOICE_FOR_NORMAL_ROUNDS Multiple Choice questions
 * - At least MIN_ESTIMATION_FOR_NORMAL_ROUNDS Estimation questions
 * 
 * This filter does NOT apply to bonus rounds (Collective List, Hot Button)
 * as those questions are mixed across all categories.
 */
export async function getCategoriesForNormalRounds(): Promise<CategoryInfo[]> {
  const allCategories = await getCategoryList();
  
  // Filter categories that meet the minimum requirements for normal rounds
  const suitableCategories = allCategories.filter(cat => {
    const hasEnoughMultipleChoice = (cat.multipleChoiceCount ?? 0) >= CATEGORY_LIMITS.MIN_MULTIPLE_CHOICE_FOR_NORMAL_ROUNDS;
    const hasEnoughEstimation = (cat.estimationCount ?? 0) >= CATEGORY_LIMITS.MIN_ESTIMATION_FOR_NORMAL_ROUNDS;
    
    return hasEnoughMultipleChoice && hasEnoughEstimation;
  });
  
  console.log(`✅ ${suitableCategories.length}/${allCategories.length} categories suitable for normal rounds (min ${CATEGORY_LIMITS.MIN_MULTIPLE_CHOICE_FOR_NORMAL_ROUNDS} MC + ${CATEGORY_LIMITS.MIN_ESTIMATION_FOR_NORMAL_ROUNDS} EST)`);
  
  return suitableCategories;
}

/**
 * Get random categories for voting with smart prioritization
 * 
 * HYBRID APPROACH:
 * - Unused categories get 3x weight (higher chance but not overwhelming)
 * - Used categories still have a chance but are less likely
 * - Ensures variety while maintaining some randomness
 * - Auto-reset when 80% of categories have been used
 * 
 * IMPORTANT: Only returns categories suitable for NORMAL rounds
 * (with sufficient Multiple Choice AND Estimation questions).
 * Bonus rounds (Collective List, Hot Button) use all categories.
 * 
 * @param count - Number of categories to return
 * @param usedCategoryIds - Set of already played category IDs
 */
export async function getRandomCategoriesForVoting(
  count: number = CATEGORY_LIMITS.VOTING_CATEGORIES, 
  usedCategoryIds: Set<string> = new Set()
): Promise<CategoryInfo[]> {
  // Use filtered categories for normal rounds
  const allCategories = await getCategoriesForNormalRounds();
  
  if (allCategories.length === 0) {
    console.warn('⚠️ No categories available with sufficient questions for normal rounds!');
    return [];
  }
  
  // Auto-reset if most categories have been used
  if (usedCategoryIds.size >= allCategories.length * BONUS_ROUND_THRESHOLDS.CATEGORY_RESET_THRESHOLD && allCategories.length > 5) {
    console.log(`♻️ ${usedCategoryIds.size}/${allCategories.length} categories used, resetting pool for variety`);
    usedCategoryIds.clear();
  }
  
  // Separate into unused (fresh) and used categories
  const unusedCategories = allCategories.filter(c => !usedCategoryIds.has(c.id));
  const usedCategories = allCategories.filter(c => usedCategoryIds.has(c.id));
  
  // Weighted selection: unused categories get 3x the weight
  const UNUSED_WEIGHT = 3;
  const USED_WEIGHT = 1;
  
  // Build weighted array
  const weightedPool: CategoryInfo[] = [];
  
  // Add unused categories with higher weight (3x)
  for (const cat of unusedCategories) {
    for (let i = 0; i < UNUSED_WEIGHT; i++) {
      weightedPool.push(cat);
    }
  }
  
  // Add used categories with lower weight (1x)
  for (const cat of usedCategories) {
    for (let i = 0; i < USED_WEIGHT; i++) {
      weightedPool.push(cat);
    }
  }
  
  // Shuffle the weighted pool
  const shuffled = fisherYatesShuffle(weightedPool);
  
  // Select unique categories (remove duplicates from weighting)
  const selected: CategoryInfo[] = [];
  const selectedIds = new Set<string>();
  
  for (const cat of shuffled) {
    if (!selectedIds.has(cat.id)) {
      selected.push(cat);
      selectedIds.add(cat.id);
      
      if (selected.length >= count) {
        break;
      }
    }
  }
  
  // Final shuffle to randomize order
  return fisherYatesShuffle(selected);
}

/**
 * Get random questions from a category
 */
export async function getRandomQuestions(categoryId: string, count: number, excludeIds: string[] = []): Promise<GameQuestion[]> {
  if (prisma) {
    try {
      const dbQuestions = await getDbRandomQuestions(categoryId, count, excludeIds);
      if (dbQuestions.length > 0) {
        console.log(`📊 Loaded ${dbQuestions.length} questions from database (excluded ${excludeIds.length} used)`);
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

// ============================================
// BONUS ROUND (COLLECTIVE_LIST) QUESTIONS
// ============================================

interface BonusRoundQuestion {
  id: string;
  topic: string;
  description?: string;
  category?: string; // Kategorie-Name (z.B. "Marvel", "Geographie")
  categoryIcon?: string; // Kategorie-Icon (emoji)
  questionType: string; // z.B. "Liste", "Sortieren", etc.
  items: {
    id: string;
    display: string;
    aliases: string[];
    group?: string;
  }[];
  timePerTurn: number;
  pointsPerCorrect: number;
  fuzzyThreshold: number;
}

/**
 * Get a random COLLECTIVE_LIST question from the database
 * 
 * NOTE: Bonus rounds are NOT restricted by category question counts.
 * They can use questions from ANY category, regardless of how many
 * Multiple Choice or Estimation questions that category has.
 * 
 * @param excludeIds - Question IDs to exclude (already used in this session)
 */
export async function getRandomBonusRoundQuestion(excludeIds: string[] = []): Promise<BonusRoundQuestion | null> {
  if (!prisma) {
    console.warn('⚠️ Database not available for bonus round questions');
    return null;
  }

  try {
    // Get count of available questions first (more efficient)
    const availableCount = await prisma.question.count({
      where: {
        type: 'COLLECTIVE_LIST',
        isActive: true,
        ...(excludeIds.length > 0 && { id: { notIn: excludeIds } }),
      },
    });

    // If no questions available with exclusions, try without
    let finalExcludeIds = excludeIds;
    let questionCount = availableCount;
    
    if (availableCount === 0 && excludeIds.length > 0) {
      console.log('♻️ All bonus questions used, resetting pool');
      questionCount = await prisma.question.count({
        where: {
          type: 'COLLECTIVE_LIST',
          isActive: true,
        },
      });
      finalExcludeIds = [];
    }

    if (questionCount === 0) {
      console.warn('⚠️ No COLLECTIVE_LIST questions found in database');
      return null;
    }

    // Pick a random offset instead of loading all questions
    const randomOffset = Math.floor(Math.random() * questionCount);
    
    const questions = await prisma.question.findMany({
      where: {
        type: 'COLLECTIVE_LIST',
        isActive: true,
        ...(finalExcludeIds.length > 0 && { id: { notIn: finalExcludeIds } }),
      },
      skip: randomOffset,
      take: 1,
    });

    if (questions.length === 0) {
      console.warn('⚠️ Failed to fetch bonus question');
      return null;
    }

    const randomQuestion = questions[0];
    const content = randomQuestion.content as any;

    if (!content || !content.items || !Array.isArray(content.items)) {
      console.warn('⚠️ Invalid COLLECTIVE_LIST content structure');
      return null;
    }

    // Load category info if available
    let categoryName: string | undefined;
    let categoryIcon: string | undefined;
    if (randomQuestion.categoryId) {
      const categoryData = await getCategoryData(randomQuestion.categoryId);
      if (categoryData) {
        categoryName = categoryData.name;
        categoryIcon = categoryData.icon;
      }
    }

    return {
      id: randomQuestion.id,
      topic: content.topic || randomQuestion.text,
      description: content.description,
      category: categoryName,
      categoryIcon: categoryIcon,
      questionType: 'Liste', // TODO: Map from QuestionType when we have more bonus round types
      items: content.items.map((item: any, idx: number) => ({
        id: item.id || `item-${idx}`,
        display: item.display,
        aliases: item.aliases || [item.display],
        group: item.group,
      })),
      timePerTurn: content.timePerTurn || (COLLECTIVE_LIST_TIMING.TURN_DURATION / 1000),
      pointsPerCorrect: content.pointsPerCorrect || COLLECTIVE_LIST_SCORING.POINTS_PER_CORRECT,
      fuzzyThreshold: content.fuzzyThreshold || MATCHING.FUZZY_THRESHOLD,
    };
  } catch (error) {
    console.error('Error loading bonus round question:', error);
    return null;
  }
}

/**
 * Get random HOT_BUTTON questions from the database (5 questions for a round)
 * 
 * NOTE: Bonus rounds are NOT restricted by category question counts.
 * They can use questions from ANY category, regardless of how many
 * Multiple Choice or Estimation questions that category has.
 * 
 * @param excludeIds - Question IDs to exclude (already used in this session)
 * @param count - Number of questions to fetch (default: 5)
 */
export async function getRandomHotButtonQuestions(excludeIds: string[] = [], count: number = HOT_BUTTON_LIMITS.DEFAULT_QUESTIONS): Promise<any | null> {
  if (!prisma) {
    console.warn('⚠️ Database not available for hot button questions');
    return null;
  }

  try {
    // Get count of available questions first
    const availableCount = await prisma.question.count({
      where: {
        type: 'HOT_BUTTON',
        isActive: true,
        ...(excludeIds.length > 0 && { id: { notIn: excludeIds } }),
      },
    });

    // If not enough questions available with exclusions, try without
    let finalExcludeIds = excludeIds;
    let questionCount = availableCount;
    
    if (availableCount < count && excludeIds.length > 0) {
      console.log('♻️ Not enough hot button questions, resetting pool');
      questionCount = await prisma.question.count({
        where: {
          type: 'HOT_BUTTON',
          isActive: true,
        },
      });
      finalExcludeIds = [];
    }

    if (questionCount === 0) {
      console.warn('⚠️ No HOT_BUTTON questions found in database');
      return null;
    }

    // Fetch random questions
    const questionsToFetch = Math.min(count, questionCount);
    const randomOffsets: number[] = [];
    
    // Generate random unique offsets
    for (let i = 0; i < questionsToFetch; i++) {
      let offset;
      do {
        offset = Math.floor(Math.random() * questionCount);
      } while (randomOffsets.includes(offset));
      randomOffsets.push(offset);
    }

    // Fetch all questions in parallel
    const questionPromises = randomOffsets.map(offset =>
      prisma!.question.findMany({
        where: {
          type: 'HOT_BUTTON',
          isActive: true,
          ...(finalExcludeIds.length > 0 && { id: { notIn: finalExcludeIds } }),
        },
        skip: offset,
        take: 1,
        include: {
          category: true,
        },
      })
    );

    const questionResults = await Promise.all(questionPromises);
    const questions = questionResults.flat().filter(q => q); // Flatten and remove nulls

    if (questions.length === 0) {
      console.warn('⚠️ Failed to fetch hot button questions');
      return null;
    }

    // Transform questions
    const hotButtonQuestions = questions.map((q, idx) => {
      const content = q.content as any;

      if (!content?.correctAnswer) {
        console.warn(`⚠️ Invalid HOT_BUTTON content structure for question ${q.id}`);
        return null;
      }

      return {
        id: q.id,
        text: q.text,
        correctAnswer: content.correctAnswer,
        acceptedAnswers: content.acceptedAnswers || [content.correctAnswer],
        revealSpeed: content.revealSpeed || 50,
        pointsCorrect: HOT_BUTTON_SCORING.BASE_POINTS,
        pointsWrong: HOT_BUTTON_SCORING.WRONG_PENALTY,
        category: q.category?.name,
        categoryIcon: q.category?.icon,
        difficulty: q.difficulty,
      };
    }).filter(q => q !== null);

    if (hotButtonQuestions.length === 0) {
      return null;
    }

    // Return a package with all questions
    return {
      type: 'hot_button',
      questionType: 'HOT_BUTTON', // WICHTIG für bonusRound.ts Router
      questionIds: hotButtonQuestions.map(q => q.id),
      questions: hotButtonQuestions,
      buzzerTimeout: HOT_BUTTON_TIMING.BUZZER_TIMEOUT / 1000, // Convert ms to seconds
      answerTimeout: HOT_BUTTON_TIMING.ANSWER_TIMEOUT / 1000, // Convert ms to seconds
      allowRebuzz: true,
      maxRebuzzAttempts: HOT_BUTTON_LIMITS.MAX_REBUZZ_ATTEMPTS,
      fuzzyThreshold: MATCHING.FUZZY_THRESHOLD,
    };
  } catch (error) {
    console.error('Error loading hot button questions:', error);
    return null;
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

