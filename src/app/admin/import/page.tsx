'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { 
  Upload, 
  FileJson, 
  Database,
  AlertCircle,
  CheckCircle2,
  Clock,
  Info,
  Languages,
  ChevronLeft,
  ChevronRight,
  Loader2,
  FolderOpen,
  X,
  Eye,
  Check,
  Import,
  Settings,
  Key,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface OpenTDBQuestion {
  type: string;
  difficulty: string;
  category: string;
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
  _translated?: boolean;
  _selected?: boolean;
  _duplicate?: boolean;
  _duplicateCategory?: string;
  _originalQuestion?: string; // Original English question for duplicate detection
  _originalCorrectAnswer?: string;
  _originalIncorrectAnswers?: string[];
}

interface Category {
  id: string;
  slug: string;
  name: string;
  icon: string;
  _count?: { questions: number };
}

interface ImportLog {
  id: string;
  source: string;
  filename: string | null;
  questionsAdded: number;
  questionsSkipped: number;
  questionsFailed: number;
  createdAt: string;
}

const BATCH_SIZE_OPTIONS = [10, 25, 50, 100];

type ImportMode = 'opentdb' | 'hotbutton';

export default function ImportPage() {
  // Mode State
  const [importMode, setImportMode] = useState<ImportMode>('opentdb');
  
  // File & Questions State
  const [file, setFile] = useState<File | null>(null);
  const [questions, setQuestions] = useState<OpenTDBQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // Hot Button Import State
  const [hotButtonJson, setHotButtonJson] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedQuestions, setParsedQuestions] = useState<Array<{
    text: string;
    correctAnswer: string;
    acceptedAnswers?: string[];
    difficulty: 'EASY' | 'MEDIUM' | 'HARD';
    category?: string;
    matchedCategoryId?: string;
    matchedCategoryName?: string;
    selected: boolean;
  }>>([]);
  const [isImportingHotButton, setIsImportingHotButton] = useState(false);
  const [hotButtonResult, setHotButtonResult] = useState<{
    success: boolean;
    message: string;
    added?: number;
    failed?: number;
    errors?: string[];
  } | null>(null);
  
  // Pagination & Selection
  const [currentPage, setCurrentPage] = useState(0);
  const [batchSize, setBatchSize] = useState(50);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  
  // Translation State
  const [apiKey, setApiKey] = useState('');
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationProgress, setTranslationProgress] = useState<string | null>(null);
  const [isBulkTranslating, setIsBulkTranslating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number; translated: number } | null>(null);
  const bulkAbortRef = useRef(false);
  
  // Import State
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    message: string;
    added?: number;
    skipped?: number;
    failed?: number;
  } | null>(null);
  
  // Import Logs
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  
  // Duplicate Check State
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);
  const [duplicateCount, setDuplicateCount] = useState(0);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load categories and logs on mount
  useEffect(() => {
    fetch('/api/admin/categories')
      .then(res => res.json())
      .then(data => setCategories(data))
      .catch(console.error);
    
    // Load logs - we'll need to add an API endpoint or use SSR
    setLogsLoading(false);
    
    // Load API key from localStorage
    const savedKey = localStorage.getItem('openai_api_key');
    if (savedKey) {
      setApiKey(savedKey);
    }
  }, []);

  // Calculate pagination
  const totalPages = Math.ceil(questions.length / batchSize);
  const startIndex = currentPage * batchSize;
  const endIndex = Math.min(startIndex + batchSize, questions.length);
  const currentQuestions = questions.slice(startIndex, endIndex);

  // File handling
  const handleFileSelect = useCallback(async (selectedFile: File) => {
    setFile(selectedFile);
    setError(null);
    setQuestions([]);
    setSelectedIndices(new Set());
    setCurrentPage(0);
    setImportResult(null);

    try {
      const text = await selectedFile.text();
      const data = JSON.parse(text);
      
      // Handle both array and {results: [...]} format
      const questionsData = Array.isArray(data) ? data : data.results || [];
      
      if (!questionsData.length) {
        setError('Keine Fragen in der Datei gefunden');
        return;
      }

      // Validate structure
      const isValid = questionsData.every((q: any) => 
        q.question && q.correct_answer && Array.isArray(q.incorrect_answers)
      );
      
      if (!isValid) {
        setError('Ungültiges Dateiformat. Erwarte OpenTDB-Format mit question, correct_answer und incorrect_answers.');
        return;
      }

      const loadedQuestions = questionsData.map((q: OpenTDBQuestion) => {
        // Store original English text for duplicate detection
        const originalQuestion = decodeHtmlEntities(q.question);
        const originalCorrectAnswer = decodeHtmlEntities(q.correct_answer);
        const originalIncorrectAnswers = q.incorrect_answers.map(decodeHtmlEntities);
        
        return {
          ...q, 
          _selected: true,
          question: originalQuestion,
          correct_answer: originalCorrectAnswer,
          incorrect_answers: originalIncorrectAnswers,
          // Store originals for later (will be used when importing after translation)
          _originalQuestion: originalQuestion,
          _originalCorrectAnswer: originalCorrectAnswer,
          _originalIncorrectAnswers: originalIncorrectAnswers,
        };
      });
      
      setQuestions(loadedQuestions);
      setSelectedIndices(new Set(questionsData.map((_: any, i: number) => i)));
      
      // Check for duplicates in the background
      checkForDuplicates(loadedQuestions);
    } catch (e) {
      setError('Fehler beim Lesen der Datei: ' + (e instanceof Error ? e.message : 'Unbekannter Fehler'));
    }
  }, []);
  
  // Check for duplicates against the database
  const checkForDuplicates = async (questionsToCheck: OpenTDBQuestion[]) => {
    setIsCheckingDuplicates(true);
    try {
      const response = await fetch('/api/admin/check-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: questionsToCheck }),
      });
      
      const data = await response.json();
      
      if (data.duplicates && data.duplicates.length > 0) {
        // Mark duplicates in questions array
        setQuestions(prev => prev.map((q, idx) => {
          const duplicateInfo = data.duplicateInfo?.find((d: { index: number }) => d.index === idx);
          return {
            ...q,
            _duplicate: data.duplicates.includes(idx),
            _duplicateCategory: duplicateInfo?.category,
          };
        }));
        
        // Remove duplicates from selection
        setSelectedIndices(prev => {
          const next = new Set(prev);
          data.duplicates.forEach((idx: number) => next.delete(idx));
          return next;
        });
        
        setDuplicateCount(data.duplicateCount);
      }
    } catch (e) {
      console.error('Failed to check duplicates:', e);
    } finally {
      setIsCheckingDuplicates(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile?.type === 'application/json' || droppedFile?.name.endsWith('.json')) {
      handleFileSelect(droppedFile);
    } else {
      setError('Bitte eine JSON-Datei auswählen');
    }
  }, [handleFileSelect]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileSelect(selectedFile);
    }
  };

  // Selection handling
  const toggleSelection = (globalIndex: number) => {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(globalIndex)) {
        next.delete(globalIndex);
      } else {
        next.add(globalIndex);
      }
      return next;
    });
  };

  const selectAllOnPage = () => {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      for (let i = startIndex; i < endIndex; i++) {
        next.add(i);
      }
      return next;
    });
  };

  const deselectAllOnPage = () => {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      for (let i = startIndex; i < endIndex; i++) {
        next.delete(i);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIndices(new Set(questions.map((_, i) => i)));
  };

  const deselectAll = () => {
    setSelectedIndices(new Set());
  };

  // Translation
  const handleTranslate = async () => {
    if (!apiKey) {
      setShowApiKeyInput(true);
      return;
    }

    // Save API key
    localStorage.setItem('openai_api_key', apiKey);

    const selectedOnPage = currentQuestions
      .map((_, i) => startIndex + i)
      .filter(i => selectedIndices.has(i));

    if (selectedOnPage.length === 0) {
      setError('Keine Fragen auf dieser Seite ausgewählt');
      return;
    }

    setIsTranslating(true);
    setError(null);
    setTranslationProgress(`Übersetze ${selectedOnPage.length} Fragen...`);

    try {
      const questionsToTranslate = selectedOnPage.map(i => questions[i]);
      
      const response = await fetch('/api/admin/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questions: questionsToTranslate,
          apiKey,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Übersetzungsfehler');
      }

      // Update questions with translations
      setQuestions(prev => {
        const next = [...prev];
        selectedOnPage.forEach((globalIndex, localIndex) => {
          if (data.questions[localIndex]) {
            next[globalIndex] = {
              ...next[globalIndex],
              ...data.questions[localIndex],
            };
          }
        });
        return next;
      });

      setTranslationProgress(`✓ ${selectedOnPage.length} Fragen übersetzt (${data.usage?.total_tokens || '?'} Tokens)`);
      setTimeout(() => setTranslationProgress(null), 5000);
    } catch (e) {
      setError('Übersetzungsfehler: ' + (e instanceof Error ? e.message : 'Unbekannter Fehler'));
    } finally {
      setIsTranslating(false);
    }
  };

  // Bulk Translation - translate all pages one by one
  const handleBulkTranslate = async () => {
    if (!apiKey) {
      setShowApiKeyInput(true);
      return;
    }

    // Save API key
    localStorage.setItem('openai_api_key', apiKey);

    // Get all selected questions that aren't yet translated
    const untranslatedSelectedIndices = Array.from(selectedIndices).filter(i => !questions[i]._translated);
    
    if (untranslatedSelectedIndices.length === 0) {
      setError('Alle ausgewählten Fragen sind bereits übersetzt');
      return;
    }

    setIsBulkTranslating(true);
    bulkAbortRef.current = false;
    setError(null);
    
    // Process in batches of batchSize
    const batches: number[][] = [];
    for (let i = 0; i < untranslatedSelectedIndices.length; i += batchSize) {
      batches.push(untranslatedSelectedIndices.slice(i, i + batchSize));
    }
    
    let totalTranslated = 0;
    let totalTokens = 0;
    
    setBulkProgress({ current: 0, total: batches.length, translated: 0 });
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      // Check for abort
      if (bulkAbortRef.current) {
        setBulkProgress(null);
        setTranslationProgress(`⚠️ Abgebrochen nach ${totalTranslated} Fragen`);
        setTimeout(() => setTranslationProgress(null), 5000);
        setIsBulkTranslating(false);
        return;
      }
      
      const batchIndices = batches[batchIndex];
      setBulkProgress({ current: batchIndex + 1, total: batches.length, translated: totalTranslated });
      
      try {
        const questionsToTranslate = batchIndices.map(i => questions[i]);
        
        const response = await fetch('/api/admin/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            questions: questionsToTranslate,
            apiKey,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Übersetzungsfehler');
        }

        // Update questions with translations
        setQuestions(prev => {
          const next = [...prev];
          batchIndices.forEach((globalIndex, localIndex) => {
            if (data.questions[localIndex]) {
              next[globalIndex] = {
                ...next[globalIndex],
                ...data.questions[localIndex],
              };
            }
          });
          return next;
        });

        totalTranslated += batchIndices.length;
        totalTokens += data.usage?.total_tokens || 0;
        
        // Small delay between batches to avoid rate limiting
        if (batchIndex < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (e) {
        setError(`Fehler bei Batch ${batchIndex + 1}: ` + (e instanceof Error ? e.message : 'Unbekannter Fehler'));
        setBulkProgress(null);
        setIsBulkTranslating(false);
        return;
      }
    }
    
    setBulkProgress(null);
    setTranslationProgress(`✓ Alle ${totalTranslated} Fragen übersetzt (${totalTokens.toLocaleString()} Tokens)`);
    setTimeout(() => setTranslationProgress(null), 8000);
    setIsBulkTranslating(false);
  };

  const handleAbortBulkTranslate = () => {
    bulkAbortRef.current = true;
  };

  // Import
  const handleImport = async () => {
    if (!selectedCategory) {
      setError('Bitte eine Zielkategorie auswählen');
      return;
    }

    const selectedQuestionsList = Array.from(selectedIndices).map(i => questions[i]);
    
    if (selectedQuestionsList.length === 0) {
      setError('Keine Fragen ausgewählt');
      return;
    }

    setIsImporting(true);
    setError(null);
    setImportResult(null);

    try {
      const response = await fetch('/api/admin/import-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questions: selectedQuestionsList,
          categoryId: selectedCategory,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Import-Fehler');
      }

      setImportResult({
        success: true,
        message: data.message,
        added: data.added,
        skipped: data.skipped,
        failed: data.failed,
      });

      // Clear imported questions from selection
      if (data.added > 0) {
        setSelectedIndices(new Set());
      }
    } catch (e) {
      setImportResult({
        success: false,
        message: e instanceof Error ? e.message : 'Import fehlgeschlagen',
      });
    } finally {
      setIsImporting(false);
    }
  };

  const selectedCount = selectedIndices.size;
  const translatedCount = questions.filter(q => q._translated).length;
  const selectedOnPageCount = currentQuestions.filter((_, i) => selectedIndices.has(startIndex + i)).length;
  const duplicatesOnPageCount = currentQuestions.filter(q => q._duplicate).length;

  // Process JSON and match categories
  const handleProcessJson = () => {
    if (!hotButtonJson.trim()) {
      setError('Bitte JSON-Daten eingeben');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setParsedQuestions([]);

    try {
      const data = JSON.parse(hotButtonJson);
      
      if (!data.questions || !Array.isArray(data.questions)) {
        throw new Error('JSON muss ein "questions" Array enthalten');
      }

      // Create category lookup maps
      const categoryBySlug = new Map(categories.map(c => [c.slug.toLowerCase(), c]));
      const categoryByName = new Map(categories.map(c => [c.name.toLowerCase(), c]));

      // Process each question
      const processed = data.questions.map((q: any, idx: number) => {
        let matchedCategoryId: string | undefined;
        let matchedCategoryName: string | undefined;

        // Try to match category
        if (q.category) {
          const categoryLower = q.category.toLowerCase();
          const matched = categoryBySlug.get(categoryLower) || categoryByName.get(categoryLower);
          
          if (matched) {
            matchedCategoryId = matched.id;
            matchedCategoryName = `${matched.icon} ${matched.name}`;
          }
        }

        return {
          text: q.text || '',
          correctAnswer: q.correctAnswer || '',
          acceptedAnswers: q.acceptedAnswers,
          difficulty: q.difficulty || 'MEDIUM',
          category: q.category,
          matchedCategoryId,
          matchedCategoryName,
          selected: true, // All selected by default
        };
      });

      setParsedQuestions(processed);
    } catch (e) {
      setError('JSON-Fehler: ' + (e instanceof Error ? e.message : 'Ungültiges Format'));
    } finally {
      setIsProcessing(false);
    }
  };

  // Toggle question selection
  const toggleQuestionSelection = (index: number) => {
    setParsedQuestions(prev => prev.map((q, i) => 
      i === index ? { ...q, selected: !q.selected } : q
    ));
  };

  // Update question category
  const updateQuestionCategory = (index: number, categoryId: string) => {
    setParsedQuestions(prev => prev.map((q, i) => {
      if (i === index) {
        const cat = categories.find(c => c.id === categoryId);
        return {
          ...q,
          matchedCategoryId: categoryId,
          matchedCategoryName: cat ? `${cat.icon} ${cat.name}` : undefined,
        };
      }
      return q;
    }));
  };

  // Select/Deselect all
  const selectAllQuestions = () => {
    setParsedQuestions(prev => prev.map(q => ({ ...q, selected: true })));
  };

  const deselectAllQuestions = () => {
    setParsedQuestions(prev => prev.map(q => ({ ...q, selected: false })));
  };

  // Import selected questions
  const handleHotButtonImport = async () => {
    const selectedQuestions = parsedQuestions.filter(q => q.selected);
    
    if (selectedQuestions.length === 0) {
      setError('Keine Fragen ausgewählt');
      return;
    }

    // Check if all selected questions have a category
    const missingCategory = selectedQuestions.some(q => !q.matchedCategoryId);
    if (missingCategory) {
      setError('Alle ausgewählten Fragen müssen eine Kategorie haben');
      return;
    }

    setIsImportingHotButton(true);
    setError(null);
    setHotButtonResult(null);

    try {
      // Transform to API format with explicit categoryId
      const questionsToImport = selectedQuestions.map(q => ({
        text: q.text,
        correctAnswer: q.correctAnswer,
        acceptedAnswers: q.acceptedAnswers,
        difficulty: q.difficulty,
        categoryId: q.matchedCategoryId!, // We checked this above
      }));

      const response = await fetch('/api/admin/import-hotbutton', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questions: questionsToImport,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Import fehlgeschlagen');
      }

      setHotButtonResult({
        success: true,
        message: result.message,
        added: result.added,
        failed: result.failed,
        errors: result.errors,
      });
      
      // Clear on success
      if (result.added > 0) {
        setHotButtonJson('');
        setParsedQuestions([]);
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Unbekannter Fehler';
      setHotButtonResult({
        success: false,
        message: errorMsg,
      });
    } finally {
      setIsImportingHotButton(false);
    }
  };

  // Count selected questions with valid categories
  const selectedQuestionsCount = parsedQuestions.filter(q => q.selected).length;
  const validQuestionsCount = parsedQuestions.filter(q => q.selected && q.matchedCategoryId).length;

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Import</h1>
          <p className="text-muted-foreground mt-1">
            Fragen aus externen Quellen importieren & übersetzen
          </p>
        </div>
        
        {/* API Key Toggle */}
        <button
          onClick={() => setShowApiKeyInput(!showApiKeyInput)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
            apiKey ? 'border-green-500/50 bg-green-500/10 text-green-400' : 'border-border bg-card hover:bg-muted'
          }`}
        >
          <Key className="w-4 h-4" />
          {apiKey ? 'API Key gesetzt' : 'API Key eingeben'}
        </button>
      </div>

      {/* Mode Selector */}
      <div className="flex items-center gap-2 bg-card border border-border rounded-xl p-1">
        <button
          onClick={() => setImportMode('opentdb')}
          className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
            importMode === 'opentdb'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <FileJson className="w-4 h-4 inline-block mr-2" />
          OpenTDB Import
        </button>
        <button
          onClick={() => setImportMode('hotbutton')}
          className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
            importMode === 'hotbutton'
              ? 'bg-amber-600 text-white'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          ⚡ Hot Button Import
        </button>
      </div>

      {/* API Key Input */}
      {showApiKeyInput && (
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
          <Key className="w-5 h-5 text-muted-foreground" />
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="OpenAI API Key (sk-...)"
            className="flex-1 bg-muted rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            onClick={() => {
              localStorage.setItem('openai_api_key', apiKey);
              setShowApiKeyInput(false);
            }}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
          >
            Speichern
          </button>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium text-red-500">Fehler</p>
            <p className="text-sm text-red-400">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-4 h-4 text-red-400 hover:text-red-300" />
          </button>
        </div>
      )}

      {/* HOT BUTTON IMPORT MODE */}
      {importMode === 'hotbutton' && (
        <>
          {/* Info Banner */}
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-amber-500">⚡ Hot Button Massen-Import</p>
              <p className="text-sm text-amber-400/80 mt-1">
                Importiere mehrere Hot Button Fragen auf einmal via JSON. Kategorien werden automatisch zugeordnet (Slug oder Name).
              </p>
            </div>
          </div>

          {/* Hot Button Result */}
          {hotButtonResult && (
            <div className={`${hotButtonResult.success ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'} border rounded-xl p-4`}>
              <div className="flex items-start gap-3">
                {hotButtonResult.success ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                )}
                <div className="flex-1">
                  <p className={`font-medium ${hotButtonResult.success ? 'text-green-500' : 'text-red-500'}`}>
                    {hotButtonResult.success ? 'Import erfolgreich' : 'Import fehlgeschlagen'}
                  </p>
                  <p className={`text-sm ${hotButtonResult.success ? 'text-green-400' : 'text-red-400'}`}>
                    {hotButtonResult.message}
                  </p>
                  {hotButtonResult.errors && hotButtonResult.errors.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <p className="text-sm font-medium text-red-400">Fehler:</p>
                      <ul className="text-xs text-red-400/80 space-y-0.5 list-disc list-inside">
                        {hotButtonResult.errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <button onClick={() => setHotButtonResult(null)} className="ml-auto">
                  <X className={`w-4 h-4 ${hotButtonResult.success ? 'text-green-400 hover:text-green-300' : 'text-red-400 hover:text-red-300'}`} />
                </button>
              </div>
            </div>
          )}

          {/* JSON Input */}
          <div className="bg-card border border-border rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">JSON-Daten</h3>
              <button
                onClick={() => {
                  const example = {
                    questions: [
                      {
                        text: "Welcher Schauspieler spielte Jack Dawson in Titanic?",
                        correctAnswer: "Leonardo DiCaprio",
                        acceptedAnswers: ["DiCaprio", "Leo DiCaprio"],
                        difficulty: "MEDIUM",
                        category: "filme_serien"
                      },
                      {
                        text: "In welchem Jahr fiel die Berliner Mauer?",
                        correctAnswer: "1989",
                        acceptedAnswers: ["neunzehnhundertneunundachtzig"],
                        difficulty: "EASY"
                      }
                    ]
                  };
                  setHotButtonJson(JSON.stringify(example, null, 2));
                }}
                className="text-sm text-primary hover:underline"
              >
                Beispiel laden
              </button>
            </div>
            
            <textarea
              value={hotButtonJson}
              onChange={(e) => setHotButtonJson(e.target.value)}
              placeholder={`{\n  "questions": [\n    {\n      "text": "Deine Frage hier?",\n      "correctAnswer": "Die Antwort",\n      "acceptedAnswers": ["Variante 1", "Variante 2"],\n      "difficulty": "MEDIUM",\n      "category": "kategorie_slug"\n    }\n  ]\n}`}
              className="w-full bg-muted border border-border rounded-lg px-4 py-3 min-h-[400px] resize-y font-mono text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            
            <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-2">
              <p className="font-medium">📋 Schema:</p>
              <ul className="text-muted-foreground space-y-1 text-xs">
                <li><code className="bg-background px-1 py-0.5 rounded">text</code> (Pflicht): Die Frage</li>
                <li><code className="bg-background px-1 py-0.5 rounded">correctAnswer</code> (Pflicht): Richtige Antwort</li>
                <li><code className="bg-background px-1 py-0.5 rounded">acceptedAnswers</code> (Optional): Array mit Varianten</li>
                <li><code className="bg-background px-1 py-0.5 rounded">difficulty</code> (Optional): EASY | MEDIUM | HARD (default: MEDIUM)</li>
                <li><code className="bg-background px-1 py-0.5 rounded">category</code> (Optional): Kategorie-Slug für Auto-Matching</li>
              </ul>
            </div>

            {/* Available Categories */}
            <div className="bg-primary/10 border border-primary/30 rounded-lg p-3 text-sm space-y-2">
              <p className="font-medium text-primary">🏷️ Verfügbare Kategorien:</p>
              <div className="flex flex-wrap gap-2">
                {categories.map(cat => (
                  <code key={cat.id} className="bg-background px-2 py-1 rounded text-xs">
                    {cat.icon} {cat.slug}
                  </code>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Verwende diese Slugs im <code className="bg-background px-1 rounded">category</code> Feld für automatische Zuordnung
              </p>
            </div>
          </div>

          {/* Process Button */}
          <div className="flex justify-center">
            <button
              onClick={handleProcessJson}
              disabled={isProcessing || !hotButtonJson.trim()}
              className="flex items-center gap-2 px-8 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-lg font-medium"
            >
              {isProcessing ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Eye className="w-5 h-5" />
              )}
              JSON verarbeiten & Vorschau anzeigen
            </button>
          </div>

          {/* Parsed Questions Preview */}
          {parsedQuestions.length > 0 && (
            <>
              {/* Controls Bar */}
              <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <span className="text-sm text-muted-foreground">
                    {parsedQuestions.length} Fragen verarbeitet
                  </span>
                  <span className="text-primary">•</span>
                  <span className="text-sm text-primary">
                    {selectedQuestionsCount} ausgewählt
                  </span>
                  <span className="text-primary">•</span>
                  <span className={`text-sm ${validQuestionsCount === selectedQuestionsCount ? 'text-green-400' : 'text-yellow-500'}`}>
                    {validQuestionsCount} mit Kategorie
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={selectAllQuestions}
                    className="text-sm text-primary hover:underline"
                  >
                    Alle auswählen
                  </button>
                  <span className="text-muted-foreground">|</span>
                  <button
                    onClick={deselectAllQuestions}
                    className="text-sm text-primary hover:underline"
                  >
                    Keine
                  </button>
                </div>
              </div>

              {/* Questions List */}
              <div className="space-y-3">
                {parsedQuestions.map((q, index) => (
                  <div
                    key={index}
                    className={`bg-card border rounded-xl p-4 transition-all ${
                      q.selected 
                        ? 'border-amber-500 ring-1 ring-amber-500/30' 
                        : 'border-border opacity-60'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      {/* Checkbox */}
                      <div
                        onClick={() => toggleQuestionSelection(index)}
                        className="cursor-pointer"
                      >
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                          q.selected 
                            ? 'bg-amber-600 border-amber-600' 
                            : 'border-muted-foreground/50'
                        }`}>
                          {q.selected && <Check className="w-3 h-3 text-white" />}
                        </div>
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 min-w-0 space-y-3">
                        {/* Header */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-muted-foreground">#{index + 1}</span>
                          <Badge 
                            variant="secondary" 
                            className={`text-xs ${
                              q.difficulty === 'EASY' ? 'bg-green-500/20 text-green-400' :
                              q.difficulty === 'HARD' ? 'bg-red-500/20 text-red-400' :
                              'bg-yellow-500/20 text-yellow-400'
                            }`}
                          >
                            {q.difficulty === 'EASY' ? '🟢 Leicht' : q.difficulty === 'HARD' ? '🔴 Schwer' : '🟡 Mittel'}
                          </Badge>
                          {q.category && (
                            <Badge variant="secondary" className="text-xs">
                              Slug: {q.category}
                            </Badge>
                          )}
                        </div>
                        
                        {/* Question Text */}
                        <p className="font-medium">{q.text}</p>
                        
                        {/* Answer */}
                        <div className="flex items-center gap-2 p-2 bg-green-500/10 border border-green-500/30 rounded-lg">
                          <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                          <span className="text-green-400 text-sm">{q.correctAnswer}</span>
                        </div>
                        
                        {/* Accepted Answers */}
                        {q.acceptedAnswers && q.acceptedAnswers.length > 0 && (
                          <div className="text-xs text-muted-foreground">
                            <span className="font-medium">Varianten:</span> {q.acceptedAnswers.join(', ')}
                          </div>
                        )}
                        
                        {/* Category Selection */}
                        <div className="flex items-center gap-3">
                          <label className="text-sm text-muted-foreground">Kategorie:</label>
                          <select
                            value={q.matchedCategoryId || ''}
                            onChange={(e) => updateQuestionCategory(index, e.target.value)}
                            className={`flex-1 bg-muted rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 ${
                              q.matchedCategoryId 
                                ? 'focus:ring-amber-500 border-0' 
                                : 'focus:ring-red-500 border-2 border-red-500/50'
                            }`}
                          >
                            <option value="">Kategorie wählen...</option>
                            {categories.map(cat => (
                              <option key={cat.id} value={cat.id}>
                                {cat.icon} {cat.name}
                              </option>
                            ))}
                          </select>
                          {!q.matchedCategoryId && (
                            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Import Button */}
              <div className="bg-card border border-border rounded-xl p-6">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                      <Database className="w-5 h-5 text-amber-500" />
                      Bereit zum Importieren
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {validQuestionsCount === selectedQuestionsCount 
                        ? `${selectedQuestionsCount} Fragen können importiert werden`
                        : `⚠️ ${selectedQuestionsCount - validQuestionsCount} Fragen ohne Kategorie`
                      }
                    </p>
                  </div>
                  
                  <button
                    onClick={handleHotButtonImport}
                    disabled={isImportingHotButton || selectedQuestionsCount === 0 || validQuestionsCount !== selectedQuestionsCount}
                    className="flex items-center gap-2 px-6 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    {isImportingHotButton ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        ⚡
                        <Import className="w-5 h-5" />
                      </>
                    )}
                    {selectedQuestionsCount} Fragen importieren
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* OPENTDB IMPORT MODE */}
      {importMode === 'opentdb' && (
        <>

      {/* Import Result */}
      {importResult && (
        <div className={`${importResult.success ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'} border rounded-xl p-4 flex items-start gap-3`}>
          {importResult.success ? (
            <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
          )}
          <div>
            <p className={`font-medium ${importResult.success ? 'text-green-500' : 'text-red-500'}`}>
              {importResult.success ? 'Import erfolgreich' : 'Import fehlgeschlagen'}
            </p>
            <p className={`text-sm ${importResult.success ? 'text-green-400' : 'text-red-400'}`}>
              {importResult.message}
            </p>
          </div>
          <button onClick={() => setImportResult(null)} className="ml-auto">
            <X className={`w-4 h-4 ${importResult.success ? 'text-green-400 hover:text-green-300' : 'text-red-400 hover:text-red-300'}`} />
          </button>
        </div>
      )}

      {/* File Upload Area */}
      {!file && (
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileInputChange}
            className="hidden"
          />
          <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">JSON-Datei auswählen</h3>
          <p className="text-muted-foreground">
            Ziehe eine OpenTDB-JSON-Datei hierher oder klicke zum Auswählen
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Unterstützt: OpenTDB Export Format
          </p>
        </div>
      )}

      {/* Loaded File Info & Controls */}
      {file && questions.length > 0 && (
        <>
          {/* File Info Bar */}
          <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <FileJson className="w-8 h-8 text-primary" />
              <div>
                <p className="font-semibold">{file.name}</p>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span>{questions.length} Fragen geladen</span>
                  <span>•</span>
                  <span className="text-primary">{selectedCount} ausgewählt</span>
                  <span>•</span>
                  <span className="text-purple-400">{translatedCount} übersetzt</span>
                  {duplicateCount > 0 && (
                    <>
                      <span>•</span>
                      <span className="text-yellow-500">{duplicateCount} bereits importiert</span>
                    </>
                  )}
                  {isCheckingDuplicates && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Prüfe Duplikate...
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                setFile(null);
                setQuestions([]);
                setSelectedIndices(new Set());
                setImportResult(null);
                setDuplicateCount(0);
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4" />
              Datei schließen
            </button>
          </div>

          {/* Controls Bar */}
          <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between flex-wrap gap-4">
            {/* Left: Batch Size & Selection */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Pro Seite:</span>
                <select
                  value={batchSize}
                  onChange={e => {
                    setBatchSize(Number(e.target.value));
                    setCurrentPage(0);
                  }}
                  className="bg-muted rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {BATCH_SIZE_OPTIONS.map(size => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </div>
              
              <div className="h-6 w-px bg-border" />
              
              <div className="flex items-center gap-2">
                <button
                  onClick={selectAllOnPage}
                  className="text-sm text-primary hover:underline"
                >
                  Alle auf Seite auswählen
                </button>
                <span className="text-muted-foreground">|</span>
                <button
                  onClick={deselectAllOnPage}
                  className="text-sm text-primary hover:underline"
                >
                  Abwählen
                </button>
              </div>
              
              <div className="h-6 w-px bg-border" />
              
              <div className="flex items-center gap-2">
                <button
                  onClick={selectAll}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Alle {questions.length}
                </button>
                <span className="text-muted-foreground">|</span>
                <button
                  onClick={deselectAll}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Keine
                </button>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-3">
              {/* Translate Page Button */}
              <button
                onClick={handleTranslate}
                disabled={isTranslating || isBulkTranslating || selectedOnPageCount === 0}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isTranslating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Languages className="w-4 h-4" />
                )}
                Seite übersetzen ({selectedOnPageCount})
              </button>
              
              {/* Bulk Translate All Button */}
              {isBulkTranslating ? (
                <button
                  onClick={handleAbortBulkTranslate}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  <X className="w-4 h-4" />
                  Abbrechen
                </button>
              ) : (
                <button
                  onClick={handleBulkTranslate}
                  disabled={isTranslating || selectedCount === 0 || translatedCount === selectedCount}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Alle ausgewählten Fragen übersetzen (in Batches)"
                >
                  <Languages className="w-4 h-4" />
                  Alle übersetzen ({selectedCount - translatedCount})
                </button>
              )}
            </div>
          </div>

          {/* Translation Progress */}
          {translationProgress && !bulkProgress && (
            <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4 flex items-center gap-3">
              {isTranslating ? (
                <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-purple-400" />
              )}
              <span className="text-purple-300">{translationProgress}</span>
            </div>
          )}
          
          {/* Bulk Translation Progress */}
          {bulkProgress && (
            <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
                  <span className="text-purple-300 font-medium">
                    Bulk-Übersetzung läuft...
                  </span>
                </div>
                <span className="text-purple-400 text-sm">
                  Batch {bulkProgress.current} / {bulkProgress.total}
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-purple-500 to-pink-500 h-full transition-all duration-300"
                  style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                />
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {bulkProgress.translated} Fragen übersetzt, {(bulkProgress.total - bulkProgress.current) * batchSize} verbleibend
              </p>
            </div>
          )}

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Zeige {startIndex + 1}–{endIndex} von {questions.length} Fragen
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className="p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-4 py-2 bg-muted rounded-lg text-sm">
                Seite {currentPage + 1} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={currentPage >= totalPages - 1}
                className="p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Duplicate Info Banner */}
          {duplicatesOnPageCount > 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-yellow-500">
                  {duplicatesOnPageCount} Frage{duplicatesOnPageCount !== 1 ? 'n' : ''} auf dieser Seite bereits importiert
                </p>
                <p className="text-sm text-yellow-400/80">
                  Diese Fragen wurden automatisch abgewählt und sind ausgegraut dargestellt.
                </p>
              </div>
            </div>
          )}

          {/* Questions List */}
          <div className="space-y-3">
            {currentQuestions.map((q, localIndex) => {
              const globalIndex = startIndex + localIndex;
              const isSelected = selectedIndices.has(globalIndex);
              const isDuplicate = q._duplicate;
              
              return (
                <div
                  key={globalIndex}
                  onClick={() => !isDuplicate && toggleSelection(globalIndex)}
                  className={`bg-card border rounded-xl p-4 transition-all ${
                    isDuplicate 
                      ? 'border-yellow-500/30 opacity-50 cursor-not-allowed'
                      : isSelected 
                        ? 'border-primary ring-1 ring-primary/30 cursor-pointer' 
                        : 'border-border hover:border-muted-foreground/30 cursor-pointer'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {/* Checkbox */}
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      isDuplicate 
                        ? 'bg-yellow-500/20 border-yellow-500/50'
                        : isSelected 
                          ? 'bg-primary border-primary' 
                          : 'border-muted-foreground/50'
                    }`}>
                      {isDuplicate ? (
                        <Database className="w-3 h-3 text-yellow-500" />
                      ) : isSelected ? (
                        <Check className="w-3 h-3 text-primary-foreground" />
                      ) : null}
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">#{globalIndex + 1}</span>
                        {isDuplicate && (
                          <Badge className="text-xs bg-yellow-500/20 text-yellow-500 border-yellow-500/30">
                            <Database className="w-3 h-3 mr-1" />
                            Bereits in {q._duplicateCategory || 'DB'}
                          </Badge>
                        )}
                        <Badge variant="secondary" className="text-xs">
                          {q.type === 'boolean' ? 'Wahr/Falsch' : 'Multiple Choice'}
                        </Badge>
                        <Badge 
                          variant="secondary" 
                          className={`text-xs ${
                            q.difficulty === 'easy' ? 'bg-green-500/20 text-green-400' :
                            q.difficulty === 'hard' ? 'bg-red-500/20 text-red-400' :
                            'bg-yellow-500/20 text-yellow-400'
                          }`}
                        >
                          {q.difficulty === 'easy' ? 'Leicht' : q.difficulty === 'hard' ? 'Schwer' : 'Mittel'}
                        </Badge>
                        {q._translated && (
                          <Badge className="text-xs bg-purple-500/20 text-purple-400 border-purple-500/30">
                            <Languages className="w-3 h-3 mr-1" />
                            Übersetzt
                          </Badge>
                        )}
                      </div>
                      
                      <p className="font-medium mb-3">{q.question}</p>
                      
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="flex items-center gap-2 p-2 bg-green-500/10 border border-green-500/30 rounded-lg">
                          <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                          <span className="text-green-400 truncate">{q.correct_answer}</span>
                        </div>
                        {q.incorrect_answers.map((answer, i) => (
                          <div key={i} className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                            <X className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                            <span className="text-muted-foreground truncate">{answer}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom Pagination */}
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className="p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-4 py-2 bg-muted rounded-lg text-sm">
              Seite {currentPage + 1} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage >= totalPages - 1}
              className="p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Import Section */}
          <div className="bg-card border border-border rounded-xl p-6">
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
              <Database className="w-5 h-5 text-primary" />
              In Datenbank importieren
            </h3>
            
            <div className="flex items-end gap-4 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm text-muted-foreground mb-2">
                  Zielkategorie
                </label>
                <select
                  value={selectedCategory}
                  onChange={e => setSelectedCategory(e.target.value)}
                  className="w-full bg-muted rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Kategorie auswählen...</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.icon} {cat.name} ({cat._count?.questions || 0} Fragen)
                    </option>
                  ))}
                </select>
              </div>
              
              <button
                onClick={handleImport}
                disabled={isImporting || !selectedCategory || selectedCount === 0}
                className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isImporting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Import className="w-4 h-4" />
                )}
                {selectedCount} Fragen importieren
              </button>
            </div>
            
            <p className="text-sm text-muted-foreground mt-4">
              Importierte Fragen werden als "nicht verifiziert" markiert und können im Fragen-Manager überprüft werden.
            </p>
          </div>
        </>
      )}

      {/* Info Section when no file loaded */}
      {!file && (
        <>
          <div className="bg-primary/10 border border-primary/30 rounded-xl p-4 flex items-start gap-3">
            <Info className="w-5 h-5 text-primary mt-0.5" />
            <div>
              <p className="font-medium text-primary">OpenTDB Import mit Übersetzung</p>
              <p className="text-sm text-muted-foreground mt-1">
                Lade eine JSON-Datei von OpenTDB hoch, übersetze sie segmentweise ins Deutsche und importiere sie in die Datenbank.
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
                  curl &quot;https://opentdb.com/api.php?amount=50&category=15&type=multiple&quot; | jq &apos;.results&apos; {'>'} opentdb_gaming.json
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
        </>
      )}
      </>
      )}
    </div>
  );
}

// Decode HTML entities from OpenTDB
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&quot;': '"',
    '&#039;': "'",
    '&apos;': "'",
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&nbsp;': ' ',
    '&ldquo;': '"',
    '&rdquo;': '"',
    '&lsquo;': "'",
    '&rsquo;': "'",
    '&mdash;': '—',
    '&ndash;': '–',
    '&hellip;': '…',
    '&eacute;': 'é',
    '&Eacute;': 'É',
    '&uuml;': 'ü',
    '&Uuml;': 'Ü',
    '&ouml;': 'ö',
    '&Ouml;': 'Ö',
    '&auml;': 'ä',
    '&Auml;': 'Ä',
    '&szlig;': 'ß',
  };

  let result = text;
  for (const [entity, char] of Object.entries(entities)) {
    result = result.replace(new RegExp(entity, 'g'), char);
  }
  
  // Handle numeric entities
  result = result.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
  
  return result;
}
