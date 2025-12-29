import { Suspense } from 'react';
import Link from 'next/link';
import { Plus, Edit2, HelpCircle, Eye, EyeOff, GripVertical } from 'lucide-react';
import { prisma } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// Force dynamic rendering (no static generation during build)
export const dynamic = 'force-dynamic';

async function getCategories() {
  const categories = await prisma.category.findMany({
    orderBy: { sortOrder: 'asc' },
    include: {
      _count: {
        select: { questions: true },
      },
    },
  });
  
  return categories;
}

async function CategoriesContent() {
  const categories = await getCategories();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Kategorien</h1>
          <p className="text-muted-foreground mt-1">
            {categories.length} Kategorien verfügbar
          </p>
        </div>
        <Link href="/admin/categories/new">
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Neue Kategorie
          </Button>
        </Link>
      </div>

      {/* Categories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map((category) => (
          <div
            key={category.id}
            className={cn(
              'bg-card rounded-xl border border-border p-5 transition-all',
              'hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5',
              !category.isActive && 'opacity-60'
            )}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div 
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                  style={{ 
                    backgroundColor: category.color 
                      ? `${category.color}20` 
                      : 'hsl(var(--muted))' 
                  }}
                >
                  {category.icon}
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{category.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {category.slug}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-1">
                {!category.isActive && (
                  <Badge variant="secondary" className="gap-1">
                    <EyeOff className="w-3 h-3" />
                    Inaktiv
                  </Badge>
                )}
              </div>
            </div>
            
            {category.description && (
              <p className="text-sm text-muted-foreground mt-3 line-clamp-2">
                {category.description}
              </p>
            )}
            
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <HelpCircle className="w-4 h-4" />
                <span>{category._count.questions} Fragen</span>
              </div>
              
              <div className="flex items-center gap-2">
                <Link href={`/admin/questions?category=${category.slug}`}>
                  <Button variant="ghost" size="sm" className="gap-1">
                    <Eye className="w-4 h-4" />
                    Fragen
                  </Button>
                </Link>
                <Link href={`/admin/categories/${category.id}`}>
                  <Button variant="ghost" size="sm" className="gap-1">
                    <Edit2 className="w-4 h-4" />
                    Bearbeiten
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {categories.length === 0 && (
        <div className="text-center py-12 bg-card rounded-xl border border-border">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <HelpCircle className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold">Keine Kategorien</h3>
          <p className="text-muted-foreground mt-1 mb-4">
            Erstelle deine erste Kategorie oder führe die JSON-Migration aus.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link href="/admin/categories/new">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Neue Kategorie
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
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="h-4 w-32 bg-muted rounded mt-2" />
        </div>
        <div className="h-10 w-40 bg-muted rounded" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="bg-card rounded-xl border border-border p-5 h-48" />
        ))}
      </div>
    </div>
  );
}

export default function CategoriesPage() {
  return (
    <div className="p-8">
      <Suspense fallback={<LoadingSkeleton />}>
        <CategoriesContent />
      </Suspense>
    </div>
  );
}



