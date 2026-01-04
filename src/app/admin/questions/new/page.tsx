'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Save, 
  Plus, 
  Trash2, 
  HelpCircle,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface Category {
  id: string;
  slug: string;
  name: string;
  icon: string;
}

type QuestionType = 'MULTIPLE_CHOICE' | 'ESTIMATION' | 'TRUE_FALSE' | 'SORTING' | 'TEXT_INPUT' | 'MATCHING' | 'COLLECTIVE_LIST' | 'HOT_BUTTON';
type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

export default function NewQuestionPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  
  // Form state
  const [categoryId, setCategoryId] = useState('');
  const [text, setText] = useState('');
  const [type, setType] = useState<QuestionType>('MULTIPLE_CHOICE');
  const [difficulty, setDifficulty] = useState<Difficulty>('MEDIUM');
  const [explanation, setExplanation] = useState('');
  
  // Multiple Choice state
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [incorrectAnswers, setIncorrectAnswers] = useState(['', '', '']);
  
  // Estimation state
  const [correctValue, setCorrectValue] = useState('');
  const [unit, setUnit] = useState('');
  
  // True/False state
  const [trueFalseAnswer, setTrueFalseAnswer] = useState(true);
  
  // Collective List state
  const [collectiveTopic, setCollectiveTopic] = useState('');
  const [collectiveDescription, setCollectiveDescription] = useState('');
  const [collectiveItemsText, setCollectiveItemsText] = useState('');
  const [collectiveTimePerTurn, setCollectiveTimePerTurn] = useState(15);
  
  // Hot Button state
  const [hotButtonCorrectAnswer, setHotButtonCorrectAnswer] = useState('');
  const [hotButtonAliases, setHotButtonAliases] = useState('');
  const [hotButtonRevealSpeed, setHotButtonRevealSpeed] = useState(50);

  // Parse items text to structured format
  const parseCollectiveItems = (text: string) => {
    return text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map((line, idx) => {
        const parts = line.split(',').map(p => p.trim()).filter(p => p.length > 0);
        const display = parts[0] || '';
        return {
          id: `item-${idx}`,
          display,
          aliases: parts, // All parts including display as aliases
        };
      });
  };

  // Load categories
  useEffect(() => {
    fetch('/api/admin/categories')
      .then((res) => res.json())
      .then((data) => {
        setCategories(data);
        if (data.length > 0 && !categoryId) {
          setCategoryId(data[0].id);
        }
      })
      .catch(console.error);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      let content: any;
      
      if (type === 'MULTIPLE_CHOICE') {
        content = {
          correctAnswer,
          incorrectAnswers: incorrectAnswers.filter(a => a.trim()),
        };
      } else if (type === 'ESTIMATION') {
        content = {
          correctValue: parseFloat(correctValue),
          unit,
        };
      } else if (type === 'TRUE_FALSE') {
        content = {
          correctAnswer: trueFalseAnswer,
        };
      } else if (type === 'COLLECTIVE_LIST') {
        const parsedItems = parseCollectiveItems(collectiveItemsText);
        content = {
          topic: collectiveTopic,
          description: collectiveDescription || undefined,
          items: parsedItems,
          timePerTurn: collectiveTimePerTurn,
          fuzzyThreshold: 0.85,
        };
      } else if (type === 'HOT_BUTTON') {
        const aliases = hotButtonAliases
          .split(',')
          .map(a => a.trim())
          .filter(a => a.length > 0);
        
        content = {
          correctAnswer: hotButtonCorrectAnswer,
          acceptedAnswers: [hotButtonCorrectAnswer, ...aliases],
          revealSpeed: hotButtonRevealSpeed,
        };
      }

      // For COLLECTIVE_LIST, use the topic as the question text
      const questionText = type === 'COLLECTIVE_LIST' ? collectiveTopic : text;

      const response = await fetch('/api/admin/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId,
          text: questionText,
          type,
          difficulty,
          content,
          explanation: explanation || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Fehler beim Speichern');
      }

      router.push('/admin/questions');
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const addIncorrectAnswer = () => {
    if (incorrectAnswers.length < 5) {
      setIncorrectAnswers([...incorrectAnswers, '']);
    }
  };

  const removeIncorrectAnswer = (index: number) => {
    if (incorrectAnswers.length > 1) {
      setIncorrectAnswers(incorrectAnswers.filter((_, i) => i !== index));
    }
  };

  const updateIncorrectAnswer = (index: number, value: string) => {
    const updated = [...incorrectAnswers];
    updated[index] = value;
    setIncorrectAnswers(updated);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link href="/admin/questions">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Zurück
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Neue Frage</h1>
          <p className="text-muted-foreground">Erstelle eine neue Quiz-Frage</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="bg-card rounded-xl border border-border p-6 space-y-4">
          <h2 className="text-lg font-semibold">Basis-Informationen</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Category */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                Kategorie *
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2"
                required
              >
                <option value="">Auswählen...</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.icon} {cat.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Type */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                Fragetyp *
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as QuestionType)}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2"
                required
              >
                <option value="MULTIPLE_CHOICE">Multiple Choice</option>
                <option value="ESTIMATION">Schätzfrage</option>
                <option value="TRUE_FALSE">Wahr/Falsch</option>
                <option value="COLLECTIVE_LIST">📋 Sammel-Liste</option>
                <option value="HOT_BUTTON">⚡ Hot Button</option>
              </select>
            </div>
          </div>

          {/* Question Text - hidden for COLLECTIVE_LIST */}
          {type !== 'COLLECTIVE_LIST' && (
            <div>
              <label className="text-sm font-medium mb-2 block">
                Fragetext *
              </label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 min-h-[100px] resize-y"
                placeholder="Wie lautet die Frage?"
                required
              />
            </div>
          )}

          {/* Difficulty */}
          <div>
            <label className="text-sm font-medium mb-2 block">
              Schwierigkeit
            </label>
            <div className="flex gap-2">
              {(['EASY', 'MEDIUM', 'HARD'] as Difficulty[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDifficulty(d)}
                  className={cn(
                    'px-4 py-2 rounded-lg border transition-colors',
                    difficulty === d
                      ? d === 'EASY'
                        ? 'bg-green-500/20 border-green-500 text-green-400'
                        : d === 'MEDIUM'
                        ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400'
                        : 'bg-red-500/20 border-red-500 text-red-400'
                      : 'border-border hover:border-muted-foreground'
                  )}
                >
                  {d === 'EASY' && '🟢 Einfach'}
                  {d === 'MEDIUM' && '🟡 Mittel'}
                  {d === 'HARD' && '🔴 Schwer'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Answer Content based on Type */}
        <div className="bg-card rounded-xl border border-border p-6 space-y-4">
          <h2 className="text-lg font-semibold">
            {type === 'MULTIPLE_CHOICE' && 'Antworten'}
            {type === 'ESTIMATION' && 'Schätzwert'}
            {type === 'TRUE_FALSE' && 'Richtige Antwort'}
            {type === 'COLLECTIVE_LIST' && 'Listen-Konfiguration'}
            {type === 'HOT_BUTTON' && '⚡ Hot Button Konfiguration'}
          </h2>

          {/* Multiple Choice */}
          {type === 'MULTIPLE_CHOICE' && (
            <div className="space-y-4">
              {/* Correct Answer */}
              <div>
                <label className="text-sm font-medium mb-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  Richtige Antwort *
                </label>
                <Input
                  value={correctAnswer}
                  onChange={(e) => setCorrectAnswer(e.target.value)}
                  placeholder="Die korrekte Antwort"
                  className="border-green-500/50"
                  required
                />
              </div>

              {/* Incorrect Answers */}
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Falsche Antworten *
                </label>
                <div className="space-y-2">
                  {incorrectAnswers.map((answer, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        value={answer}
                        onChange={(e) => updateIncorrectAnswer(index, e.target.value)}
                        placeholder={`Falsche Antwort ${index + 1}`}
                        required={index === 0}
                      />
                      {incorrectAnswers.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeIncorrectAnswer(index)}
                        >
                          <Trash2 className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                {incorrectAnswers.length < 5 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={addIncorrectAnswer}
                    className="mt-2"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Weitere Antwort
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Estimation */}
          {type === 'ESTIMATION' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Korrekter Wert *
                </label>
                <Input
                  type="number"
                  value={correctValue}
                  onChange={(e) => setCorrectValue(e.target.value)}
                  placeholder="z.B. 42"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Einheit *
                </label>
                <Input
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="z.B. Meter, Jahre, Millionen"
                  required
                />
              </div>
            </div>
          )}

          {/* True/False */}
          {type === 'TRUE_FALSE' && (
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setTrueFalseAnswer(true)}
                className={cn(
                  'flex-1 py-4 rounded-lg border-2 transition-colors font-medium',
                  trueFalseAnswer
                    ? 'bg-green-500/20 border-green-500 text-green-400'
                    : 'border-border hover:border-muted-foreground'
                )}
              >
                ✓ Wahr
              </button>
              <button
                type="button"
                onClick={() => setTrueFalseAnswer(false)}
                className={cn(
                  'flex-1 py-4 rounded-lg border-2 transition-colors font-medium',
                  !trueFalseAnswer
                    ? 'bg-red-500/20 border-red-500 text-red-400'
                    : 'border-border hover:border-muted-foreground'
                )}
              >
                ✗ Falsch
              </button>
            </div>
          )}

          {/* Collective List / Sammel-Liste */}
          {type === 'COLLECTIVE_LIST' && (
            <div className="space-y-6">
              {/* Topic & Description */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Thema *
                  </label>
                  <Input
                    value={collectiveTopic}
                    onChange={(e) => setCollectiveTopic(e.target.value)}
                    placeholder="z.B. US-Bundesstaaten"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Zeit pro Zug (Sekunden)
                  </label>
                  <Input
                    type="number"
                    min={5}
                    max={60}
                    value={collectiveTimePerTurn}
                    onChange={(e) => setCollectiveTimePerTurn(parseInt(e.target.value) || 15)}
                  />
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Beschreibung (optional)
                </label>
                <Input
                  value={collectiveDescription}
                  onChange={(e) => setCollectiveDescription(e.target.value)}
                  placeholder="z.B. Nenne alle 50 Bundesstaaten der USA"
                />
              </div>

              {/* Items List - Textarea */}
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Begriffe ({parseCollectiveItems(collectiveItemsText).length} Einträge)
                </label>
                <p className="text-xs text-muted-foreground mb-3">
                  Pro Zeile ein Begriff. Aliasse (alternative Schreibweisen) mit Kommas trennen.<br />
                  <span className="text-primary">Beispiel:</span> California, Kalifornien, Cali
                </p>
                
                <textarea
                  value={collectiveItemsText}
                  onChange={(e) => setCollectiveItemsText(e.target.value)}
                  className="w-full bg-muted border border-border rounded-lg px-3 py-2 min-h-[300px] resize-y font-mono text-sm"
                  placeholder={`California, Kalifornien
New York, Newyork
Texas
Delaware`}
                />
              </div>
            </div>
          )}

          {/* Hot Button */}
          {type === 'HOT_BUTTON' && (
            <div className="space-y-4">
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-4">
                <p className="text-sm text-amber-200 flex items-start gap-2">
                  <span className="text-xl shrink-0">⚡</span>
                  <span>
                    <strong>Hot Button:</strong> Einzelfrage für Buzzer-Runden. Die Frage wird Zeichen für Zeichen enthüllt.
                    Spieler buzzern und antworten. Richtige Antwort: Punkte + Speed-Bonus. Falsche Antwort: -500 Punkte.
                  </span>
                </p>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">
                  Richtige Antwort *
                </label>
                <Input
                  value={hotButtonCorrectAnswer}
                  onChange={(e) => setHotButtonCorrectAnswer(e.target.value)}
                  placeholder="z.B. Leonardo DiCaprio"
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">
                  Akzeptierte Varianten (optional)
                </label>
                <Input
                  value={hotButtonAliases}
                  onChange={(e) => setHotButtonAliases(e.target.value)}
                  placeholder="z.B. DiCaprio, Leo DiCaprio (mit Kommas trennen)"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Alternative Schreibweisen die auch als richtig gelten. Fuzzy Matching erkennt auch Tippfehler!
                </p>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">
                  Enthüllungs-Geschwindigkeit
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min={20}
                    max={100}
                    step={10}
                    value={hotButtonRevealSpeed}
                    onChange={(e) => setHotButtonRevealSpeed(parseInt(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-sm font-mono bg-muted px-3 py-1 rounded">
                    {hotButtonRevealSpeed}ms
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Millisekunden pro Zeichen. Niedriger = schneller (20-30ms: schwer, 50ms: mittel, 80-100ms: einfach)
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Additional Info */}
        <div className="bg-card rounded-xl border border-border p-6 space-y-4">
          <h2 className="text-lg font-semibold">Zusätzliche Infos</h2>
          
          <div>
            <label className="text-sm font-medium mb-2 block">
              Erklärung (optional)
            </label>
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 min-h-[80px] resize-y"
              placeholder="Wird nach der Antwort angezeigt..."
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-4">
          <Link href="/admin/questions">
            <Button type="button" variant="ghost">
              Abbrechen
            </Button>
          </Link>
          <Button type="submit" disabled={isLoading}>
            <Save className="w-4 h-4 mr-2" />
            {isLoading ? 'Speichert...' : 'Speichern'}
          </Button>
        </div>
      </form>
    </div>
  );
}



