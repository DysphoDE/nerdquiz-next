'use client';

import { useRouter } from 'next/navigation';
import { Search, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface Category {
  id: string;
  slug: string;
  name: string;
  icon: string;
}

interface QuestionFiltersProps {
  categories: Category[];
  currentCategory?: string;
  currentType?: string;
  currentDifficulty?: string;
  currentVerified?: string;
  currentSearch?: string;
}

export function QuestionFilters({
  categories,
  currentCategory,
  currentType,
  currentDifficulty,
  currentVerified,
  currentSearch,
}: QuestionFiltersProps) {
  const router = useRouter();

  const buildUrl = (newParams: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = {
      category: currentCategory,
      type: currentType,
      difficulty: currentDifficulty,
      verified: currentVerified,
      search: currentSearch,
      ...newParams,
    };
    
    Object.entries(merged).forEach(([key, value]) => {
      if (value && value !== 'all') {
        params.set(key, value);
      }
    });
    
    return `/admin/questions?${params.toString()}`;
  };

  const handleFilterChange = (key: string, value: string) => {
    const url = buildUrl({ 
      [key]: value === 'all' ? undefined : value,
      page: undefined, // Reset page when filter changes
    });
    router.push(url);
  };

  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center gap-4">
        {/* Search */}
        <div className="flex-1 min-w-[200px]">
          <form action="/admin/questions" method="GET">
            {/* Preserve other filters */}
            {currentCategory && <input type="hidden" name="category" value={currentCategory} />}
            {currentType && <input type="hidden" name="type" value={currentType} />}
            {currentDifficulty && <input type="hidden" name="difficulty" value={currentDifficulty} />}
            {currentVerified && <input type="hidden" name="verified" value={currentVerified} />}
            
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                name="search"
                placeholder="Fragen durchsuchen..."
                defaultValue={currentSearch}
                className="pl-10"
              />
            </div>
          </form>
        </div>
        
        {/* Category Filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <select
            className="bg-muted border border-border rounded-lg px-3 py-2 text-sm"
            value={currentCategory || 'all'}
            onChange={(e) => handleFilterChange('category', e.target.value)}
          >
            <option value="all">Alle Kategorien</option>
            {categories.map((cat) => (
              <option key={cat.slug} value={cat.slug}>
                {cat.icon} {cat.name}
              </option>
            ))}
          </select>
        </div>
        
        {/* Type Filter */}
        <select
          className="bg-muted border border-border rounded-lg px-3 py-2 text-sm"
          value={currentType || 'all'}
          onChange={(e) => handleFilterChange('type', e.target.value)}
        >
          <option value="all">Alle Typen</option>
          <option value="MULTIPLE_CHOICE">Multiple Choice</option>
          <option value="ESTIMATION">Schätzfragen</option>
          <option value="TRUE_FALSE">Wahr/Falsch</option>
          <option value="COLLECTIVE_LIST">📝 Sammel-Liste</option>
          <option value="HOT_BUTTON">🔥 Hot Button</option>
          <option value="SORTING">Sortieren</option>
          <option value="TEXT_INPUT">Freitext</option>
          <option value="MATCHING">Zuordnung</option>
        </select>
        
        {/* Difficulty Filter */}
        <select
          className="bg-muted border border-border rounded-lg px-3 py-2 text-sm"
          value={currentDifficulty || 'all'}
          onChange={(e) => handleFilterChange('difficulty', e.target.value)}
        >
          <option value="all">Alle Schwierigkeiten</option>
          <option value="EASY">Einfach</option>
          <option value="MEDIUM">Mittel</option>
          <option value="HARD">Schwer</option>
        </select>
        
        {/* Verified Filter */}
        <select
          className="bg-muted border border-border rounded-lg px-3 py-2 text-sm"
          value={currentVerified || 'all'}
          onChange={(e) => handleFilterChange('verified', e.target.value)}
        >
          <option value="all">Alle Status</option>
          <option value="true">✓ Verifiziert</option>
          <option value="false">⏳ Ungeprüft</option>
        </select>
      </div>
    </div>
  );
}



