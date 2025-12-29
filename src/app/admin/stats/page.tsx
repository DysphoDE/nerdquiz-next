import { Suspense } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  Trophy,
  Calendar,
  HelpCircle,
} from 'lucide-react';
import { prisma } from '@/lib/db';

async function getStats() {
  const now = new Date();
  const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalGames,
    gamesLast7Days,
    gamesLast30Days,
    totalPlayers,
    avgPlayersPerGame,
    topCategories,
    recentGames,
  ] = await Promise.all([
    prisma.gameSession.count(),
    prisma.gameSession.count({
      where: { createdAt: { gte: last7Days } },
    }),
    prisma.gameSession.count({
      where: { createdAt: { gte: last30Days } },
    }),
    prisma.playerResult.count(),
    prisma.gameSession.count() > 0
      ? prisma.playerResult.count().then(
          (total) => total / Math.max(1, prisma.gameSession.count() as unknown as number)
        )
      : 0,
    prisma.question.groupBy({
      by: ['categoryId'],
      _sum: { timesPlayed: true },
      orderBy: { _sum: { timesPlayed: 'desc' } },
      take: 5,
    }),
    prisma.gameSession.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        results: {
          orderBy: { rank: 'asc' },
          take: 3,
        },
      },
    }),
  ]);

  // Get category details for top categories
  const categoryIds = topCategories.map((c) => c.categoryId);
  const categories = await prisma.category.findMany({
    where: { id: { in: categoryIds } },
  });
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  return {
    totalGames,
    gamesLast7Days,
    gamesLast30Days,
    totalPlayers,
    topCategories: topCategories.map((c) => ({
      ...c,
      category: categoryMap.get(c.categoryId),
    })),
    recentGames,
  };
}

function StatCard({ 
  icon: Icon, 
  label, 
  value, 
  subValue,
}: { 
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  subValue?: string;
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-3xl font-bold mt-1">{value}</p>
          {subValue && (
            <p className="text-sm text-muted-foreground mt-1">{subValue}</p>
          )}
        </div>
        <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}

async function StatsContent() {
  const stats = await getStats();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Statistiken</h1>
        <p className="text-muted-foreground mt-1">
          Übersicht über Spielaktivitäten
        </p>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={BarChart3}
          label="Spiele gesamt"
          value={stats.totalGames}
        />
        <StatCard
          icon={Calendar}
          label="Letzte 7 Tage"
          value={stats.gamesLast7Days}
        />
        <StatCard
          icon={TrendingUp}
          label="Letzte 30 Tage"
          value={stats.gamesLast30Days}
        />
        <StatCard
          icon={Users}
          label="Teilnahmen gesamt"
          value={stats.totalPlayers}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Categories */}
        <div className="bg-card rounded-xl border border-border p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-accent" />
            Beliebteste Kategorien
          </h2>
          
          {stats.topCategories.length > 0 ? (
            <div className="space-y-3">
              {stats.topCategories.map((item, index) => (
                <div
                  key={item.categoryId}
                  className="flex items-center gap-3"
                >
                  <span className="text-2xl font-bold text-muted-foreground w-8">
                    {index + 1}.
                  </span>
                  <span className="text-2xl">
                    {item.category?.icon || '❓'}
                  </span>
                  <div className="flex-1">
                    <div className="font-medium">
                      {item.category?.name || 'Unbekannt'}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {item._sum.timesPlayed || 0} mal gespielt
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <HelpCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Noch keine Spieldaten</p>
            </div>
          )}
        </div>

        {/* Recent Games */}
        <div className="bg-card rounded-xl border border-border p-6">
          <h2 className="text-lg font-semibold mb-4">Letzte Spiele</h2>
          
          {stats.recentGames.length > 0 ? (
            <div className="space-y-4">
              {stats.recentGames.map((game) => (
                <div
                  key={game.id}
                  className="flex items-center justify-between py-2 border-b border-border last:border-0"
                >
                  <div>
                    <div className="font-medium font-mono">
                      {game.roomCode}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {new Date(game.createdAt).toLocaleDateString('de-DE', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm">
                      {game.results.length} Spieler
                    </div>
                    {game.results[0] && (
                      <div className="text-sm text-accent">
                        🏆 {game.results[0].playerName}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Noch keine Spiele</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div>
        <div className="h-8 w-40 bg-muted rounded" />
        <div className="h-4 w-56 bg-muted rounded mt-2" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-card rounded-xl border border-border p-6 h-28" />
        ))}
      </div>
    </div>
  );
}

export default function StatsPage() {
  return (
    <div className="p-8">
      <Suspense fallback={<LoadingSkeleton />}>
        <StatsContent />
      </Suspense>
    </div>
  );
}



