import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { CreateCategorySchema } from '@/lib/validations/questions';

// GET /api/admin/categories - List all categories
export async function GET() {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: {
          select: { questions: true },
        },
      },
    });
    
    return NextResponse.json(categories);
  } catch (error) {
    console.error('Failed to fetch categories:', error);
    return NextResponse.json(
      { error: 'Fehler beim Laden der Kategorien' },
      { status: 500 }
    );
  }
}

// POST /api/admin/categories - Create new category
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate
    const result = CreateCategorySchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: 'Ungültige Daten', details: result.error.flatten() },
        { status: 400 }
      );
    }
    
    const data = result.data;
    
    // Check if slug exists
    const existing = await prisma.category.findUnique({
      where: { slug: data.slug },
    });
    
    if (existing) {
      return NextResponse.json(
        { error: 'Eine Kategorie mit diesem Slug existiert bereits' },
        { status: 400 }
      );
    }
    
    // Get max sort order
    const maxOrder = await prisma.category.aggregate({
      _max: { sortOrder: true },
    });
    
    const category = await prisma.category.create({
      data: {
        ...data,
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
      },
    });
    
    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    console.error('Failed to create category:', error);
    return NextResponse.json(
      { error: 'Fehler beim Erstellen der Kategorie' },
      { status: 500 }
    );
  }
}



