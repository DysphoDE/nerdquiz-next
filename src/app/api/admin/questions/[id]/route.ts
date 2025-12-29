import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { 
  validateQuestionContent, 
  type QuestionType 
} from '@/lib/validations/questions';

interface Params {
  params: Promise<{ id: string }>;
}

// GET /api/admin/questions/[id] - Get single question
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    
    const question = await prisma.question.findUnique({
      where: { id },
      include: {
        category: {
          select: { id: true, name: true, icon: true, slug: true },
        },
      },
    });
    
    if (!question) {
      return NextResponse.json(
        { error: 'Frage nicht gefunden' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(question);
  } catch (error) {
    console.error('Failed to fetch question:', error);
    return NextResponse.json(
      { error: 'Fehler beim Laden der Frage' },
      { status: 500 }
    );
  }
}

// PUT /api/admin/questions/[id] - Update question
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    const { categoryId, text, type, difficulty, content, explanation, isActive, isVerified } = body;
    
    // Check if question exists
    const existing = await prisma.question.findUnique({
      where: { id },
    });
    
    if (!existing) {
      return NextResponse.json(
        { error: 'Frage nicht gefunden' },
        { status: 404 }
      );
    }
    
    // Validate content if provided
    if (content && type) {
      const contentResult = validateQuestionContent(type as QuestionType, content);
      if (!contentResult.success) {
        return NextResponse.json(
          { error: 'Ungültiger Frageninhalt', details: contentResult.error.flatten() },
          { status: 400 }
        );
      }
    }
    
    const question = await prisma.question.update({
      where: { id },
      data: {
        ...(categoryId && { categoryId }),
        ...(text && { text }),
        ...(type && { type }),
        ...(difficulty && { difficulty }),
        ...(content && { content }),
        ...(explanation !== undefined && { explanation }),
        ...(isActive !== undefined && { isActive }),
        ...(isVerified !== undefined && { isVerified }),
      },
      include: {
        category: {
          select: { name: true, icon: true },
        },
      },
    });
    
    return NextResponse.json(question);
  } catch (error) {
    console.error('Failed to update question:', error);
    return NextResponse.json(
      { error: 'Fehler beim Aktualisieren der Frage' },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/questions/[id] - Delete question
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    
    const question = await prisma.question.findUnique({
      where: { id },
    });
    
    if (!question) {
      return NextResponse.json(
        { error: 'Frage nicht gefunden' },
        { status: 404 }
      );
    }
    
    await prisma.question.delete({
      where: { id },
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete question:', error);
    return NextResponse.json(
      { error: 'Fehler beim Löschen der Frage' },
      { status: 500 }
    );
  }
}



