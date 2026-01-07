import { Suspense } from 'react';
import Link from 'next/link';
import { 
  Plus, 
  HelpCircle,
  CheckCircle2,
  Clock,
  Edit2,
  EyeOff,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { prisma } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { QuestionType, Difficulty } from '@prisma/client';
import { 
  isMultipleChoiceContent, 
  isEstimationContent,
  type QuestionContent 
} from '@/lib/validations/questions';
import { QuestionFilters } from '@/components/admin/QuestionFilters';

// Force dynamic rendering (no static generation during build)
export const dynamic = 'force-dynamic';

interface SearchParams {
  category?: string;
  type?: QuestionType;
  difficulty?: Difficulty;
  verified?: string;
  search?: string;
  page?: string;
}

const ITEMS_PER_PAGE = 20;

async function getCategories() {
  return prisma.category.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, slug: true, name: true, icon: true },
  });
}

async function getQuestions(params: SearchParams) {
  const page = parseInt(params.page || '1', 10);
  const skip = (page - 1) * ITEMS_PER_PAGE;
  
  const where: any = {};
  
  if (params.category) {
    const category = await prisma.category.findUnique({
      where: { slug: params.category },
    });
    if (category) {
      where.categoryId = category.id;
    }
  }
  
  if (params.type) {
    where.type = params.type;
  }
  
  if (params.difficulty) {
    where.difficulty = params.difficulty;
  }
  
  if (params.verified === 'true') {
    where.isVerified = true;
  } else if (params.verified === 'false') {
    where.isVerified = false;
  }
  
  if (params.search) {
    where.text = { contains: params.search, mode: 'insensitive' };
  }
  
  const [questions, total] = await Promise.all([
    prisma.question.findMany({
      where,
      include: {
        category: {
          select: { name: true, icon: true, slug: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: ITEMS_PER_PAGE,
    }),
    prisma.question.count({ where }),
  ]);
  
  return {
    questions,
    total,
    page,
    totalPages: Math.ceil(total / ITEMS_PER_PAGE),
  };
}

function QuestionTypeLabel({ type }: { type: QuestionType }) {
  const config: Record<QuestionType, { label: string; color: string }> = {
    MULTIPLE_CHOICE: { label: 'Multiple Choice', color: 'bg-blue-500/20 text-blue-400' },
    ESTIMATION: { label: 'Schätzfrage', color: 'bg-purple-500/20 text-purple-400' },
    TRUE_FALSE: { label: 'Wahr/Falsch', color: 'bg-green-500/20 text-green-400' },
    SORTING: { label: 'Sortieren', color: 'bg-orange-500/20 text-orange-400' },
    TEXT_INPUT: { label: 'Freitext', color: 'bg-cyan-500/20 text-cyan-400' },
    MATCHING: { label: 'Zuordnung', color: 'bg-pink-500/20 text-pink-400' },
    COLLECTIVE_LIST: { label: 'Sammel-Liste', color: 'bg-amber-500/20 text-amber-400' },
    HOT_BUTTON: { label: 'Hot Button', color: 'bg-yellow-500/20 text-yellow-400' },
  };
  
  const { label, color } = config[type] || { label: type, color: 'bg-muted' };
  
  return (
    <span className={cn('text-xs px-2 py-0.5 rounded-full', color)}>
      {label}
    </span>
  );
}

function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  const config = {
    EASY: { label: 'Einfach', color: 'bg-green-500/20 text-green-400' },
    MEDIUM: { label: 'Mittel', color: 'bg-yellow-500/20 text-yellow-400' },
    HARD: { label: 'Schwer', color: 'bg-red-500/20 text-red-400' },
  };
  
  const { label, color } = config[difficulty];
  
  return (
    <span className={cn('text-xs px-2 py-0.5 rounded-full', color)}>
      {label}
    </span>
  );
}

function QuestionPreview({ content, type }: { content: unknown; type: QuestionType }) {
  const parsed = content as QuestionContent;
  
  if (type === 'MULTIPLE_CHOICE' && isMultipleChoiceContent(parsed)) {
    return (
      <div className="text-xs text-muted-foreground mt-1">
        ✓ {parsed.correctAnswer} 
        <span className="ml-2">
          ({parsed.incorrectAnswers.length} falsche)
        </span>
      </div>
    );
  }
  
  if (type === 'ESTIMATION' && isEstimationContent(parsed)) {
    return (
      <div className="text-xs text-muted-foreground mt-1">
        Antwort: {parsed.correctValue} {parsed.unit}
      </div>
    );
  }
  
  if (type === 'COLLECTIVE_LIST') {
    const listContent = parsed as any;
    const itemCount = listContent?.items?.length || 0;
    return (
      <div className="text-xs text-muted-foreground mt-1">
        📋 {itemCount} Begriffe • {listContent?.timePerTurn || 15}s pro Zug
      </div>
    );
  }
  
  return null;
}

function buildPaginationUrl(searchParams: SearchParams, newPage: number) {
  const params = new URLSearchParams();
  
  if (searchParams.category) params.set('category', searchParams.category);
  if (searchParams.type) params.set('type', searchParams.type);
  if (searchParams.difficulty) params.set('difficulty', searchParams.difficulty);
  if (searchParams.verified) params.set('verified', searchParams.verified);
  if (searchParams.search) params.set('search', searchParams.search);
  params.set('page', String(newPage));
  
  return `/admin/questions?${params.toString()}`;
}

async function QuestionsContent({ searchParams }: { searchParams: SearchParams }) {
  const [categories, { questions, total, page, totalPages }] = await Promise.all([
    getCategories(),
    getQuestions(searchParams),
  ]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Fragen</h1>
          <p className="text-muted-foreground mt-1">
            {total} Fragen gefunden
          </p>
        </div>
        <Link href="/admin/questions/new">
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Neue Frage
          </Button>
        </Link>
      </div>

      {/* Filters (Client Component) */}
      <QuestionFilters
        categories={categories}
        currentCategory={searchParams.category}
        currentType={searchParams.type}
        currentDifficulty={searchParams.difficulty}
        currentVerified={searchParams.verified}
        currentSearch={searchParams.search}
      />

      {/* Questions List */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="divide-y divide-border">
          {questions.map((question) => (
            <div
              key={question.id}
              className={cn(
                'p-4 hover:bg-muted/50 transition-colors',
                !question.isActive && 'opacity-60'
              )}
            >
              <div className="flex items-start gap-4">
                {/* Status Icons */}
                <div className="flex flex-col items-center gap-1 pt-1">
                  {question.isVerified ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  ) : (
                    <Clock className="w-5 h-5 text-yellow-500" />
                  )}
                  {!question.isActive && (
                    <EyeOff className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
                
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{question.category.icon}</span>
                    <span className="text-sm text-muted-foreground">
                      {question.category.name}
                    </span>
                    <QuestionTypeLabel type={question.type} />
                    <DifficultyBadge difficulty={question.difficulty} />
                  </div>
                  
                  <p className="font-medium line-clamp-2">{question.text}</p>
                  
                  <QuestionPreview content={question.content} type={question.type} />
                  
                  {question.source && (
                    <div className="text-xs text-muted-foreground mt-2">
                      Quelle: {question.source}
                    </div>
                  )}
                </div>
                
                {/* Actions */}
                <div className="flex items-center gap-1">
                  <Link 
                    href={`/admin/questions/${question.id}/edit?${new URLSearchParams({
                      ...(searchParams.category && { category: searchParams.category }),
                      ...(searchParams.type && { type: searchParams.type }),
                      ...(searchParams.difficulty && { difficulty: searchParams.difficulty }),
                      ...(searchParams.verified && { verified: searchParams.verified }),
                      ...(searchParams.search && { search: searchParams.search }),
                      ...(searchParams.page && { page: searchParams.page }),
                    }).toString()}`}
                  >
                    <Button variant="ghost" size="sm">
                      <Edit2 className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {/* Empty State */}
        {questions.length === 0 && (
          <div className="text-center py-12">
            <HelpCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold">Keine Fragen gefunden</h3>
            <p className="text-muted-foreground mt-1">
              Passe deine Filter an oder erstelle neue Fragen.
            </p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Seite {page} von {totalPages} ({total} Fragen)
          </p>
          <div className="flex items-center gap-2">
            <Link href={buildPaginationUrl(searchParams, Math.max(1, page - 1))}>
              <Button variant="outline" size="sm" disabled={page <= 1}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
            </Link>
            <Link href={buildPaginationUrl(searchParams, Math.min(totalPages, page + 1))}>
              <Button variant="outline" size="sm" disabled={page >= totalPages}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-32 bg-muted rounded" />
          <div className="h-4 w-24 bg-muted rounded mt-2" />
        </div>
        <div className="h-10 w-36 bg-muted rounded" />
      </div>
      <div className="bg-card rounded-xl border border-border p-4 h-16" />
      <div className="bg-card rounded-xl border border-border">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="p-4 border-b border-border h-24" />
        ))}
      </div>
    </div>
  );
}

export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  
  return (
    <div className="p-8">
      <Suspense fallback={<LoadingSkeleton />}>
        <QuestionsContent searchParams={params} />
      </Suspense>
    </div>
  );
}
