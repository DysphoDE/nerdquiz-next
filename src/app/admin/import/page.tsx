import { Suspense } from 'react';
import { 
  Upload, 
  FileJson, 
  Database,
  AlertCircle,
  CheckCircle2,
  Clock,
  Info,
} from 'lucide-react';
import { prisma } from '@/lib/db';
import { Badge } from '@/components/ui/badge';

// Force dynamic rendering (no static generation during build)
export const dynamic = 'force-dynamic';

async function getImportLogs() {
  return prisma.importLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
}

async function ImportContent() {
  const logs = await getImportLogs();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Import</h1>
        <p className="text-muted-foreground mt-1">
          Fragen aus externen Quellen importieren
        </p>
      </div>

      {/* Info Banner */}
      <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-primary mt-0.5" />
        <div>
          <p className="font-medium text-primary">Imports über Command Line</p>
          <p className="text-sm text-muted-foreground mt-1">
            Imports werden aktuell über Skripte ausgeführt. Web-Upload kommt in einer späteren Version.
          </p>
        </div>
      </div>

      {/* Import Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* JSON Migration */}
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <FileJson className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold">JSON Migration</h3>
              <p className="text-sm text-muted-foreground">
                Bestehende JSON-Fragen importieren
              </p>
            </div>
          </div>
          
          <div className="bg-muted rounded-lg p-4 font-mono text-sm">
            <code>npm run db:seed</code>
          </div>
          
          <p className="text-sm text-muted-foreground mt-4">
            Importiert alle Fragen aus <code className="text-primary">data/categories/*.json</code> in die Datenbank.
          </p>
        </div>

        {/* OpenTDB Import */}
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
              <Database className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h3 className="font-semibold">OpenTDB Import</h3>
              <p className="text-sm text-muted-foreground">
                Fragen von Open Trivia Database
              </p>
            </div>
          </div>
          
          <div className="bg-muted rounded-lg p-4 font-mono text-sm space-y-2">
            <div>
              <span className="text-muted-foreground"># Beispiel:</span>
            </div>
            <code>npm run db:import-opentdb opentdb_video_games.json gaming</code>
          </div>
          
          <p className="text-sm text-muted-foreground mt-4">
            Importiert OpenTDB JSON-Exports. HTML-Entities werden automatisch dekodiert.
          </p>
        </div>
      </div>

      {/* OpenTDB API Info */}
      <div className="bg-card rounded-xl border border-border p-6">
        <h3 className="font-semibold mb-4">OpenTDB API nutzen</h3>
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Du kannst Fragen direkt von der OpenTDB API herunterladen:
          </p>
          
          <div className="bg-muted rounded-lg p-4 font-mono overflow-x-auto">
            <div className="text-muted-foreground mb-2"># 50 Gaming-Fragen herunterladen:</div>
            <code>
              curl "https://opentdb.com/api.php?amount=50&category=15&type=multiple" | jq '.results' {'>'} opentdb_gaming.json
            </code>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="text-xs text-muted-foreground">Category 15</div>
              <div className="font-medium">Video Games</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="text-xs text-muted-foreground">Category 11</div>
              <div className="font-medium">Film</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="text-xs text-muted-foreground">Category 31</div>
              <div className="font-medium">Anime & Manga</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <div className="text-xs text-muted-foreground">Category 17</div>
              <div className="font-medium">Science</div>
            </div>
          </div>
          
          <p className="text-muted-foreground">
            Alle Kategorien findest du auf{' '}
            <a 
              href="https://opentdb.com/api_config.php" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              opentdb.com
            </a>
          </p>
        </div>
      </div>

      {/* Import History */}
      <div className="bg-card rounded-xl border border-border p-6">
        <h3 className="font-semibold mb-4">Import-Verlauf</h3>
        
        {logs.length > 0 ? (
          <div className="divide-y divide-border">
            {logs.map((log) => (
              <div
                key={log.id}
                className="py-4 first:pt-0 last:pb-0 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  {log.questionsFailed === 0 ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-yellow-500" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {log.source === 'json_migration' ? 'JSON Migration' : log.source}
                      </span>
                      {log.filename && (
                        <Badge variant="secondary">{log.filename}</Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {new Date(log.createdAt).toLocaleDateString('de-DE', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="flex items-center gap-3">
                    <span className="text-green-500">+{log.questionsAdded}</span>
                    {log.questionsSkipped > 0 && (
                      <span className="text-muted-foreground">
                        {log.questionsSkipped} übersprungen
                      </span>
                    )}
                    {log.questionsFailed > 0 && (
                      <span className="text-red-500">
                        {log.questionsFailed} fehlgeschlagen
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Noch keine Imports durchgeführt</p>
          </div>
        )}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div>
        <div className="h-8 w-32 bg-muted rounded" />
        <div className="h-4 w-64 bg-muted rounded mt-2" />
      </div>
      <div className="h-20 bg-muted rounded-xl" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="h-48 bg-card rounded-xl border border-border" />
        <div className="h-48 bg-card rounded-xl border border-border" />
      </div>
    </div>
  );
}

export default function ImportPage() {
  return (
    <div className="p-8">
      <Suspense fallback={<LoadingSkeleton />}>
        <ImportContent />
      </Suspense>
    </div>
  );
}



