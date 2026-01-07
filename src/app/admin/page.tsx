import { Suspense } from 'react';
import { 
  FolderOpen, 
  HelpCircle, 
  Users, 
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { prisma } from '@/lib/db';

// Force dynamic rendering (no static generation during build)
export const dynamic = 'force-dynamic';

async function getStats() {
  const [
    categoryCount,
    questionCount,
    activeQuestionCount,
    unverifiedCount,
    recentGames,
    questionsByType,
    questionsByDifficulty,
  ] = await Promise.all([
    prisma.category.count(),
    prisma.question.count(),
    prisma.question.count({ where: { isActive: true } }),
    prisma.question.count({ where: { isVerified: false } }),
    prisma.gameSession.count({
      where: {
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.question.groupBy({
      by: ['type'],
      _count: true,
    }),
    prisma.question.groupBy({
      by: ['difficulty'],
      _count: true,
    }),
  ]);

  return {
    categoryCount,
    questionCount,
    activeQuestionCount,
    unverifiedCount,
    recentGames,
    questionsByType,
    questionsByDifficulty,
  };
}

async function getRecentImports() {
  return prisma.importLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
}

function StatCard({ 
  icon: Icon, 
  label, 
  value, 
  subValue,
  color = 'primary',
}: { 
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  subValue?: string;
  color?: 'primary' | 'secondary' | 'accent' | 'success' | 'warning';
}) {
  const colorClasses = {
    primary: 'from-primary/20 to-primary/5 text-primary',
    secondary: 'from-secondary/20 to-secondary/5 text-secondary',
    accent: 'from-accent/20 to-accent/5 text-accent',
    success: 'from-green-500/20 to-green-500/5 text-green-500',
    warning: 'from-yellow-500/20 to-yellow-500/5 text-yellow-500',
  };

  return (
    <div className="bg-card rounded-xl border border-border p-6 hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-3xl font-bold mt-1">{value}</p>
          {subValue && (
            <p className="text-sm text-muted-foreground mt-1">{subValue}</p>
          )}
        </div>
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${colorClasses[color]} flex items-center justify-center`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}

async function DashboardContent() {
  const stats = await getStats();
  const recentImports = await getRecentImports();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Übersicht über dein NerdQuiz
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={FolderOpen}
          label="Kategorien"
          value={stats.categoryCount}
          color="primary"
        />
        <StatCard
          icon={HelpCircle}
          label="Fragen gesamt"
          value={stats.questionCount}
          subValue={`${stats.activeQuestionCount} aktiv`}
          color="secondary"
        />
        <StatCard
          icon={Clock}
          label="Ungeprüft"
          value={stats.unverifiedCount}
          subValue="warten auf Review"
          color="warning"
        />
        <StatCard
          icon={Users}
          label="Spiele (24h)"
          value={stats.recentGames}
          color="accent"
        />
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Questions by Type */}
        <div className="bg-card rounded-xl border border-border p-6">
          <h2 className="text-lg font-semibold mb-4">Fragen nach Typ</h2>
          <div className="space-y-3">
            {stats.questionsByType.map((item) => (
              <div key={item.type} className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">
                      {item.type === 'MULTIPLE_CHOICE' && '🎯 Multiple Choice'}
                      {item.type === 'ESTIMATION' && '📊 Schätzfragen'}
                      {item.type === 'TRUE_FALSE' && '✅ Wahr/Falsch'}
                      {item.type === 'SORTING' && '📋 Sortieren'}
                      {item.type === 'TEXT_INPUT' && '✍️ Freitext'}
                      {item.type === 'MATCHING' && '🔗 Zuordnung'}
                      {item.type === 'COLLECTIVE_LIST' && '📝 Sammel-Liste'}
                      {item.type === 'HOT_BUTTON' && '🔥 Hot Button'}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {item._count}
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-secondary rounded-full"
                      style={{
                        width: `${(item._count / stats.questionCount) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Questions by Difficulty */}
        <div className="bg-card rounded-xl border border-border p-6">
          <h2 className="text-lg font-semibold mb-4">Fragen nach Schwierigkeit</h2>
          <div className="space-y-3">
            {stats.questionsByDifficulty.map((item) => {
              const colors = {
                EASY: 'from-green-500 to-emerald-500',
                MEDIUM: 'from-yellow-500 to-orange-500',
                HARD: 'from-red-500 to-pink-500',
              };
              const labels = {
                EASY: '🟢 Einfach',
                MEDIUM: '🟡 Mittel',
                HARD: '🔴 Schwer',
              };
              return (
                <div key={item.difficulty} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">
                        {labels[item.difficulty]}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {item._count}
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full bg-gradient-to-r ${colors[item.difficulty]} rounded-full`}
                        style={{
                          width: `${(item._count / stats.questionCount) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent Imports */}
      {recentImports.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-6">
          <h2 className="text-lg font-semibold mb-4">Letzte Imports</h2>
          <div className="space-y-3">
            {recentImports.map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between py-2 border-b border-border last:border-0"
              >
                <div className="flex items-center gap-3">
                  {log.questionsFailed === 0 ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-500" />
                  )}
                  <div>
                    <p className="font-medium">
                      {log.source === 'json_migration' ? 'JSON Migration' : log.source}
                    </p>
                    {log.filename && (
                      <p className="text-sm text-muted-foreground">{log.filename}</p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm">
                    <span className="text-green-500">+{log.questionsAdded}</span>
                    {log.questionsSkipped > 0 && (
                      <span className="text-muted-foreground ml-2">
                        ({log.questionsSkipped} übersprungen)
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(log.createdAt).toLocaleDateString('de-DE', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div>
        <div className="h-8 w-48 bg-muted rounded" />
        <div className="h-4 w-64 bg-muted rounded mt-2" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-card rounded-xl border border-border p-6 h-32" />
        ))}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  return (
    <div className="p-8">
      <Suspense fallback={<LoadingSkeleton />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}



