import { Suspense } from 'react';
import Link from 'next/link';
import { 
  AlertTriangle, 
  CheckCircle2, 
  XCircle,
  HelpCircle,
  Edit2,
  RefreshCw,
} from 'lucide-react';
import { prisma } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Force dynamic rendering (no static generation during build)
export const dynamic = 'force-dynamic';

interface Issue {
  id: string;
  questionId: string;
  questionText: string;
  category: string;
  type: 'error' | 'warning';
  message: string;
}

async function runHealthChecks() {
  const issues: Issue[] = [];
  
  // Lade alle Fragen mit Kategorie
  const questions = await prisma.question.findMany({
    include: {
      category: { select: { name: true, icon: true } },
    },
  });

  for (const q of questions) {
    const content = q.content as Record<string, unknown> | null;
    const questionInfo = {
      questionId: q.id,
      questionText: q.text.slice(0, 80) + (q.text.length > 80 ? '...' : ''),
      category: `${q.category.icon} ${q.category.name}`,
    };

    // ======================================
    // MULTIPLE CHOICE Checks
    // ======================================
    if (q.type === 'MULTIPLE_CHOICE') {
      if (!content) {
        issues.push({
          ...questionInfo,
          id: `${q.id}-no-content`,
          type: 'error',
          message: 'Kein Content vorhanden',
        });
        continue;
      }

      const correctAnswer = content.correctAnswer;
      const incorrectAnswers = content.incorrectAnswers as string[] | undefined;

      if (!correctAnswer || typeof correctAnswer !== 'string') {
        issues.push({
          ...questionInfo,
          id: `${q.id}-no-correct`,
          type: 'error',
          message: 'Keine richtige Antwort definiert',
        });
      } else if (correctAnswer.trim() === '') {
        issues.push({
          ...questionInfo,
          id: `${q.id}-empty-correct`,
          type: 'error',
          message: 'Richtige Antwort ist leer',
        });
      }

      if (!incorrectAnswers || !Array.isArray(incorrectAnswers)) {
        issues.push({
          ...questionInfo,
          id: `${q.id}-no-incorrect`,
          type: 'error',
          message: 'Keine falschen Antworten definiert',
        });
      } else {
        if (incorrectAnswers.length < 1) {
          issues.push({
            ...questionInfo,
            id: `${q.id}-too-few-incorrect`,
            type: 'error',
            message: 'Mindestens eine falsche Antwort erforderlich',
          });
        }
        
        if (incorrectAnswers.length < 3) {
          issues.push({
            ...questionInfo,
            id: `${q.id}-few-incorrect`,
            type: 'warning',
            message: `Nur ${incorrectAnswers.length} falsche Antwort(en) - empfohlen sind 3`,
          });
        }

        const emptyAnswers = incorrectAnswers.filter(a => !a || a.trim() === '');
        if (emptyAnswers.length > 0) {
          issues.push({
            ...questionInfo,
            id: `${q.id}-empty-incorrect`,
            type: 'warning',
            message: `${emptyAnswers.length} leere falsche Antwort(en)`,
          });
        }

        // Duplikate prüfen
        const allAnswers = [correctAnswer as string, ...incorrectAnswers].map(a => a?.toLowerCase().trim());
        const uniqueAnswers = new Set(allAnswers);
        if (uniqueAnswers.size !== allAnswers.length) {
          issues.push({
            ...questionInfo,
            id: `${q.id}-duplicate-answers`,
            type: 'warning',
            message: 'Doppelte Antworten vorhanden',
          });
        }
      }
    }

    // ======================================
    // ESTIMATION Checks
    // ======================================
    if (q.type === 'ESTIMATION') {
      if (!content) {
        issues.push({
          ...questionInfo,
          id: `${q.id}-no-content`,
          type: 'error',
          message: 'Kein Content vorhanden',
        });
        continue;
      }

      const correctValue = content.correctValue;
      const unit = content.unit;

      // Prüfe ob correctValue eine Zahl ist
      if (correctValue === undefined || correctValue === null) {
        issues.push({
          ...questionInfo,
          id: `${q.id}-no-value`,
          type: 'error',
          message: 'Kein Schätzwert definiert',
        });
      } else if (typeof correctValue === 'string') {
        // Wert ist ein String statt Zahl - prüfe ob es eine reine Zahl ist
        const trimmed = correctValue.trim();
        const isNumericString = /^-?\d+(\.\d+)?$/.test(trimmed);
        
        if (!isNumericString) {
          // Enthält Text wie "7 Quadrilliarden" oder "ca. 1000"
          issues.push({
            ...questionInfo,
            id: `${q.id}-invalid-value`,
            type: 'error',
            message: `Schätzwert enthält Text: "${correctValue}" (nur Zahlen erlaubt)`,
          });
        } else {
          // Ist eine Zahl, aber als String gespeichert
          issues.push({
            ...questionInfo,
            id: `${q.id}-string-value`,
            type: 'warning',
            message: `Schätzwert ist als Text gespeichert: "${correctValue}" (sollte Zahl sein)`,
          });
        }
      } else if (typeof correctValue !== 'number') {
        issues.push({
          ...questionInfo,
          id: `${q.id}-wrong-type-value`,
          type: 'error',
          message: `Schätzwert hat falschen Typ: ${typeof correctValue}`,
        });
      }

      // Prüfe Einheit
      if (unit === undefined || unit === null) {
        issues.push({
          ...questionInfo,
          id: `${q.id}-no-unit`,
          type: 'warning',
          message: 'Keine Einheit definiert',
        });
      } else if (typeof unit !== 'string') {
        issues.push({
          ...questionInfo,
          id: `${q.id}-wrong-type-unit`,
          type: 'warning',
          message: `Einheit hat falschen Typ: ${typeof unit}`,
        });
      } else if (unit.trim() === '') {
        issues.push({
          ...questionInfo,
          id: `${q.id}-empty-unit`,
          type: 'warning',
          message: 'Einheit ist leer',
        });
      }
    }

    // ======================================
    // TRUE_FALSE Checks
    // ======================================
    if (q.type === 'TRUE_FALSE') {
      if (!content) {
        issues.push({
          ...questionInfo,
          id: `${q.id}-no-content`,
          type: 'error',
          message: 'Kein Content vorhanden',
        });
        continue;
      }

      const correctAnswer = content.correctAnswer;

      if (correctAnswer === undefined || correctAnswer === null) {
        issues.push({
          ...questionInfo,
          id: `${q.id}-no-answer`,
          type: 'error',
          message: 'Keine Antwort (wahr/falsch) definiert',
        });
      } else if (typeof correctAnswer !== 'boolean') {
        issues.push({
          ...questionInfo,
          id: `${q.id}-wrong-type`,
          type: 'error',
          message: `Antwort hat falschen Typ: ${typeof correctAnswer} (sollte boolean sein)`,
        });
      }
    }

    // ======================================
    // Allgemeine Checks
    // ======================================
    
    // Fragetext zu kurz
    if (q.text.length < 10) {
      issues.push({
        ...questionInfo,
        id: `${q.id}-short-text`,
        type: 'warning',
        message: 'Fragetext sehr kurz (< 10 Zeichen)',
      });
    }

    // Fragetext endet nicht mit Fragezeichen
    if (!q.text.trim().endsWith('?') && !q.text.trim().endsWith(':')) {
      issues.push({
        ...questionInfo,
        id: `${q.id}-no-question-mark`,
        type: 'warning',
        message: 'Fragetext endet nicht mit ? oder :',
      });
    }
  }

  // Sortiere: Errors zuerst, dann Warnings
  issues.sort((a, b) => {
    if (a.type === 'error' && b.type === 'warning') return -1;
    if (a.type === 'warning' && b.type === 'error') return 1;
    return 0;
  });

  // Statistiken
  const stats = {
    totalQuestions: questions.length,
    totalIssues: issues.length,
    errors: issues.filter(i => i.type === 'error').length,
    warnings: issues.filter(i => i.type === 'warning').length,
    healthyQuestions: questions.length - new Set(issues.map(i => i.questionId)).size,
  };

  return { issues, stats };
}

function IssueRow({ issue }: { issue: Issue }) {
  return (
    <div className={cn(
      'flex items-start gap-4 p-4 rounded-lg border',
      issue.type === 'error' 
        ? 'bg-red-500/5 border-red-500/20' 
        : 'bg-yellow-500/5 border-yellow-500/20'
    )}>
      <div className="flex-shrink-0 mt-0.5">
        {issue.type === 'error' ? (
          <XCircle className="w-5 h-5 text-red-500" />
        ) : (
          <AlertTriangle className="w-5 h-5 text-yellow-500" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs text-muted-foreground">{issue.category}</span>
        </div>
        <p className="text-sm font-medium truncate mb-1">
          {issue.questionText}
        </p>
        <p className={cn(
          'text-sm',
          issue.type === 'error' ? 'text-red-400' : 'text-yellow-400'
        )}>
          {issue.message}
        </p>
      </div>
      <Link href={`/admin/questions/${issue.questionId}/edit`}>
        <Button variant="ghost" size="sm">
          <Edit2 className="w-4 h-4" />
        </Button>
      </Link>
    </div>
  );
}

async function HealthContent() {
  const { issues, stats } = await runHealthChecks();
  
  const healthPercent = Math.round((stats.healthyQuestions / stats.totalQuestions) * 100) || 0;

  return (
    <div className="space-y-8">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center gap-3 mb-2">
            <HelpCircle className="w-5 h-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Geprüfte Fragen</span>
          </div>
          <p className="text-3xl font-bold">{stats.totalQuestions}</p>
        </div>

        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center gap-3 mb-2">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            <span className="text-sm text-muted-foreground">Ohne Probleme</span>
          </div>
          <p className="text-3xl font-bold text-green-500">{stats.healthyQuestions}</p>
          <p className="text-sm text-muted-foreground">{healthPercent}%</p>
        </div>

        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center gap-3 mb-2">
            <XCircle className="w-5 h-5 text-red-500" />
            <span className="text-sm text-muted-foreground">Fehler</span>
          </div>
          <p className="text-3xl font-bold text-red-500">{stats.errors}</p>
        </div>

        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center gap-3 mb-2">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            <span className="text-sm text-muted-foreground">Warnungen</span>
          </div>
          <p className="text-3xl font-bold text-yellow-500">{stats.warnings}</p>
        </div>
      </div>

      {/* Health Bar */}
      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Datenqualität</h2>
          <span className={cn(
            'text-2xl font-bold',
            healthPercent >= 90 ? 'text-green-500' :
            healthPercent >= 70 ? 'text-yellow-500' : 'text-red-500'
          )}>
            {healthPercent}%
          </span>
        </div>
        <div className="w-full h-4 bg-muted rounded-full overflow-hidden">
          <div 
            className={cn(
              'h-full transition-all duration-500',
              healthPercent >= 90 ? 'bg-green-500' :
              healthPercent >= 70 ? 'bg-yellow-500' : 'bg-red-500'
            )}
            style={{ width: `${healthPercent}%` }}
          />
        </div>
      </div>

      {/* Issues List */}
      {issues.length > 0 ? (
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">
              Gefundene Probleme ({stats.totalIssues})
            </h2>
          </div>
          
          <div className="space-y-3 max-h-[600px] overflow-y-auto">
            {issues.map((issue) => (
              <IssueRow key={issue.id} issue={issue} />
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Alles in Ordnung!</h2>
          <p className="text-muted-foreground">
            Keine Probleme in den Fragen gefunden.
          </p>
        </div>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-card rounded-xl border border-border p-6 animate-pulse">
            <div className="h-4 w-24 bg-muted rounded mb-4" />
            <div className="h-8 w-16 bg-muted rounded" />
          </div>
        ))}
      </div>
      <div className="bg-card rounded-xl border border-border p-6 animate-pulse">
        <div className="h-4 w-32 bg-muted rounded mb-4" />
        <div className="h-4 w-full bg-muted rounded" />
      </div>
    </div>
  );
}

export default function HealthCheckPage() {
  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Datenqualität</h1>
          <p className="text-muted-foreground">
            Automatische Prüfung aller Fragen auf Fehler und Warnungen
          </p>
        </div>
        <Link href="/admin/health">
          <Button variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Neu prüfen
          </Button>
        </Link>
      </div>

      <Suspense fallback={<LoadingSkeleton />}>
        <HealthContent />
      </Suspense>
    </div>
  );
}

