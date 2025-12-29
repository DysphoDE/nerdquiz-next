import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { 
  validateQuestionContent, 
  type QuestionType 
} from '@/lib/validations/questions';

// GET /api/admin/questions - List questions with filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const categorySlug = searchParams.get('category');
    const type = searchParams.get('type');
    const difficulty = searchParams.get('difficulty');
    const verified = searchParams.get('verified');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    
    const where: any = {};
    
    if (categorySlug) {
      const category = await prisma.category.findUnique({
        where: { slug: categorySlug },
      });
      if (category) {
        where.categoryId = category.id;
      }
    }
    
    if (type) where.type = type;
    if (difficulty) where.difficulty = difficulty;
    if (verified === 'true') where.isVerified = true;
    if (verified === 'false') where.isVerified = false;
    if (search) where.text = { contains: search, mode: 'insensitive' };
    
    const [questions, total] = await Promise.all([
      prisma.question.findMany({
        where,
        include: {
          category: {
            select: { name: true, icon: true, slug: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.question.count({ where }),
    ]);
    
    return NextResponse.json({
      questions,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Failed to fetch questions:', error);
    return NextResponse.json(
      { error: 'Fehler beim Laden der Fragen' },
      { status: 500 }
    );
  }
}

// POST /api/admin/questions - Create new question
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { categoryId, text, type, difficulty, content, explanation, source } = body;
    
    // Validate required fields
    if (!categoryId || !text || !type || !content) {
      return NextResponse.json(
        { error: 'Fehlende Pflichtfelder' },
        { status: 400 }
      );
    }
    
    // Validate content based on type
    const contentResult = validateQuestionContent(type as QuestionType, content);
    if (!contentResult.success) {
      return NextResponse.json(
        { error: 'Ungültiger Frageninhalt', details: contentResult.error.flatten() },
        { status: 400 }
      );
    }
    
    // Check if category exists
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
    });
    
    if (!category) {
      return NextResponse.json(
        { error: 'Kategorie nicht gefunden' },
        { status: 400 }
      );
    }
    
    const question = await prisma.question.create({
      data: {
        categoryId,
        text,
        type,
        difficulty: difficulty || 'MEDIUM',
        content: contentResult.data,
        explanation,
        source: source || 'manual',
        isVerified: true, // Manually created questions are verified
        isActive: true,
      },
      include: {
        category: {
          select: { name: true, icon: true },
        },
      },
    });
    
    return NextResponse.json(question, { status: 201 });
  } catch (error) {
    console.error('Failed to create question:', error);
    return NextResponse.json(
      { error: 'Fehler beim Erstellen der Frage' },
      { status: 500 }
    );
  }
}



