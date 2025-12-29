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

type QuestionType = 'MULTIPLE_CHOICE' | 'ESTIMATION' | 'TRUE_FALSE' | 'SORTING' | 'TEXT_INPUT' | 'MATCHING';
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
      }

      const response = await fetch('/api/admin/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId,
          text,
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
              </select>
            </div>
          </div>

          {/* Question Text */}
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



