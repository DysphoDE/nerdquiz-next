import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { CreateCategorySchema } from '@/lib/validations/questions';

// GET /api/admin/categories/[id] - Get single category
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: { questions: true },
        },
      },
    });

    if (!category) {
      return NextResponse.json(
        { error: 'Kategorie nicht gefunden' },
        { status: 404 }
      );
    }

    return NextResponse.json(category);
  } catch (error) {
    console.error('Failed to fetch category:', error);
    return NextResponse.json(
      { error: 'Fehler beim Laden der Kategorie' },
      { status: 500 }
    );
  }
}

// PUT /api/admin/categories/[id] - Update category
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    // Check if category exists
    const existing = await prisma.category.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Kategorie nicht gefunden' },
        { status: 404 }
      );
    }

    // Check if slug is taken by another category
    if (data.slug !== existing.slug) {
      const slugExists = await prisma.category.findUnique({
        where: { slug: data.slug },
      });

      if (slugExists && slugExists.id !== id) {
        return NextResponse.json(
          { error: 'Eine andere Kategorie mit diesem Slug existiert bereits' },
          { status: 400 }
        );
      }
    }

    // Update category
    const updated = await prisma.category.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to update category:', error);
    return NextResponse.json(
      { error: 'Fehler beim Aktualisieren der Kategorie' },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/categories/[id] - Delete category
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // Check if category exists
    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: { questions: true },
        },
      },
    });

    if (!category) {
      return NextResponse.json(
        { error: 'Kategorie nicht gefunden' },
        { status: 404 }
      );
    }

    // Delete category (will cascade delete questions due to onDelete: Cascade in schema)
    await prisma.category.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: `Kategorie "${category.name}" wurde gelöscht (${category._count.questions} Fragen entfernt)`,
    });
  } catch (error) {
    console.error('Failed to delete category:', error);
    return NextResponse.json(
      { error: 'Fehler beim Löschen der Kategorie' },
      { status: 500 }
    );
  }
}

