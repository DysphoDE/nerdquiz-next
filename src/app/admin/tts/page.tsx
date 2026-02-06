'use client';

import { useState, useRef, useCallback } from 'react';
import {
  Volume2,
  Play,
  Square,
  Download,
  Loader2,
  Trash2,
  Copy,
  Plus,
  AlertCircle,
  Mic,
  Settings,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  TTS_VOICES,
  TTS_MODELS,
  TTS_CONFIG,
  TTS_INSTRUCTIONS,
  TTS_API,
  type TtsVoice,
  type TtsModel,
  type TtsInstructionKey,
} from '@/config/constants/tts';

// ============================================
// TYPES
// ============================================

interface GeneratedSnippet {
  id: string;
  text: string;
  voice: TtsVoice;
  model: TtsModel;
  instructions: string;
  speed: number;
  audioUrl: string;
  audioBlob: Blob;
  filename: string;
  createdAt: Date;
}

// ============================================
// VOICE DESCRIPTIONS
// ============================================

const VOICE_DESCRIPTIONS: Record<TtsVoice, string> = {
  alloy: 'Neutral, ausgewogen',
  ash: 'Warm, gesprächig',
  ballad: 'Weich, melodisch',
  coral: 'Klar, freundlich',
  echo: 'Tief, resonant',
  fable: 'Erzählend, warm',
  nova: 'Energetisch, hell',
  onyx: 'Tief, autoritär',
  sage: 'Ruhig, weise',
  shimmer: 'Leicht, optimistisch',
  verse: 'Vielseitig, ausdrucksstark',
  marin: 'Frisch, modern',
  cedar: 'Voll, natürlich',
};

const MODEL_DESCRIPTIONS: Record<TtsModel, string> = {
  'tts-1': 'Standard – schnell, günstig',
  'tts-1-hd': 'HD – höhere Qualität',
  'gpt-4o-mini-tts': 'GPT-4o Mini – unterstützt Instructions',
};

// ============================================
// PRESETS
// ============================================

interface Preset {
  label: string;
  text: string;
  instructionKey?: TtsInstructionKey;
  instructions?: string;
  filename: string;
}

const PRESETS: Preset[] = [
  { label: '✅ Richtig!', text: 'Richtig!', instructions: 'Sag es begeistert und anerkennend, wie ein Quizmaster der die korrekte Antwort bestätigt.', filename: 'tts-correct' },
  { label: '❌ Falsch!', text: 'Leider falsch!', instructions: 'Sag es mitfühlend aber bestimmt, wie ein Quizmaster der die falsche Antwort verkündet.', filename: 'tts-wrong' },
  { label: '⏱️ Zeit abgelaufen', text: 'Die Zeit ist um!', instructions: 'Sag es dramatisch und endgültig, wie ein Showmaster der das Zeitende verkündet.', filename: 'tts-time-up' },
  { label: '🎯 Gut gemacht!', text: 'Gut gemacht!', instructions: 'Sag es enthusiastisch und lobend.', filename: 'tts-well-done' },
  { label: '🏆 Gewonnen!', text: 'Herzlichen Glückwunsch! Du hast gewonnen!', instructions: 'Sag es triumphierend und feierlich, mit echter Begeisterung.', filename: 'tts-winner' },
  { label: '🎲 Nächste Runde', text: 'Weiter gehts mit der nächsten Runde!', instructionKey: 'ANNOUNCEMENT', filename: 'tts-next-round' },
  { label: '🔥 Streak!', text: 'Was für eine Serie!', instructions: 'Sag es beeindruckt und begeistert, wie ein Showmaster der eine Glückssträhne kommentiert.', filename: 'tts-streak' },
  { label: '💀 Rausgeflogen', text: 'Du bist rausgeflogen!', instructions: 'Sag es dramatisch und bedauernd.', filename: 'tts-eliminated' },
  { label: '🎪 Willkommen', text: 'Willkommen beim Nerd Quiz!', instructionKey: 'ANNOUNCEMENT', filename: 'tts-welcome' },
  { label: '⚡ Buzzer!', text: 'Buzzer!', instructions: 'Ruf es schnell und energisch, wie ein Quizmaster der einen Buzzer-Treffer bestätigt.', filename: 'tts-buzz' },
];

// ============================================
// COMPONENT
// ============================================

export default function AdminTTSPage() {
  // Form state
  const [text, setText] = useState('');
  const [voice, setVoice] = useState<TtsVoice>(TTS_CONFIG.DEFAULT_VOICE);
  const [model, setModel] = useState<TtsModel>(TTS_CONFIG.DEFAULT_MODEL);
  const [instructions, setInstructions] = useState('');
  const [speed, setSpeed] = useState<number>(TTS_CONFIG.DEFAULT_SPEED);
  const [filename, setFilename] = useState('tts-snippet');

  // UI state
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  // Generated snippets
  const [snippets, setSnippets] = useState<GeneratedSnippet[]>([]);

  // Audio refs
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ---- Generate ----
  const handleGenerate = useCallback(async () => {
    if (!text.trim()) {
      setError('Bitte gib einen Text ein.');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        text: text.trim(),
        voice,
        model,
        speed,
      };

      // Send instructions directly (not an instructionKey) so the API uses them as-is
      if (instructions.trim()) {
        body.instructions = instructions.trim();
      }

      const response = await fetch(TTS_API.ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      const snippet: GeneratedSnippet = {
        id: crypto.randomUUID(),
        text: text.trim(),
        voice,
        model,
        instructions: instructions.trim(),
        speed,
        audioUrl,
        audioBlob,
        filename: sanitizeFilename(filename || 'tts-snippet'),
        createdAt: new Date(),
      };

      setSnippets(prev => [snippet, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generierung fehlgeschlagen');
    } finally {
      setIsGenerating(false);
    }
  }, [text, voice, model, instructions, speed, filename]);

  // ---- Play / Stop ----
  const handlePlay = useCallback((snippet: GeneratedSnippet) => {
    // Stop current
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    if (playingId === snippet.id) {
      setPlayingId(null);
      return;
    }

    const audio = new Audio(snippet.audioUrl);
    audio.onended = () => setPlayingId(null);
    audio.onerror = () => setPlayingId(null);
    audio.play();
    audioRef.current = audio;
    setPlayingId(snippet.id);
  }, [playingId]);

  // ---- Download ----
  const handleDownload = useCallback((snippet: GeneratedSnippet) => {
    const a = document.createElement('a');
    a.href = snippet.audioUrl;
    a.download = `${snippet.filename}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  // ---- Delete ----
  const handleDelete = useCallback((id: string) => {
    setSnippets(prev => {
      const snippet = prev.find(s => s.id === id);
      if (snippet) URL.revokeObjectURL(snippet.audioUrl);
      return prev.filter(s => s.id !== id);
    });
    if (playingId === id) {
      audioRef.current?.pause();
      setPlayingId(null);
    }
  }, [playingId]);

  // ---- Apply Preset ----
  const applyPreset = useCallback((preset: Preset) => {
    setText(preset.text);
    setFilename(preset.filename);
    if (preset.instructions) {
      setInstructions(preset.instructions);
    } else if (preset.instructionKey) {
      setInstructions(TTS_INSTRUCTIONS[preset.instructionKey]);
    }
  }, []);

  // ---- Apply Instruction Preset ----
  const applyInstructionPreset = useCallback((key: TtsInstructionKey) => {
    setInstructions(TTS_INSTRUCTIONS[key]);
  }, []);

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Volume2 className="w-8 h-8 text-primary" />
          TTS Studio
        </h1>
        <p className="text-muted-foreground mt-1">
          Generiere Soundschnipsel mit OpenAI TTS zum Einbinden ins Spiel.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Left Column: Form */}
        <div className="xl:col-span-2 space-y-6">
          {/* Quick Presets */}
          <div className="bg-card rounded-xl border border-border p-6">
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-yellow-500" />
              Schnell-Vorlagen
            </h2>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset.filename}
                  onClick={() => applyPreset(preset)}
                  className="px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-sm font-medium transition-colors border border-transparent hover:border-primary/30"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Text Input */}
          <div className="bg-card rounded-xl border border-border p-6 space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Mic className="w-5 h-5 text-primary" />
              Text & Instructions
            </h2>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                Vorzulesender Text *
              </label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="z.B. Gut gemacht! oder eine Quizfrage..."
                rows={3}
                className="w-full px-4 py-3 rounded-lg bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors resize-none"
                maxLength={TTS_CONFIG.MAX_TEXT_LENGTH}
              />
              <p className="text-xs text-muted-foreground mt-1 text-right">
                {text.length} / {TTS_CONFIG.MAX_TEXT_LENGTH}
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-muted-foreground">
                  Instructions (Persona & Stil)
                </label>
                <div className="flex gap-1">
                  {(Object.keys(TTS_INSTRUCTIONS) as TtsInstructionKey[]).map((key) => (
                    <button
                      key={key}
                      onClick={() => applyInstructionPreset(key)}
                      className="px-2 py-0.5 rounded text-xs bg-muted hover:bg-primary/20 hover:text-primary transition-colors"
                      title={TTS_INSTRUCTIONS[key]}
                    >
                      {key}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Beschreibe wie die Stimme klingen soll... (nur für gpt-4o-mini-tts)"
                rows={3}
                className="w-full px-4 py-3 rounded-lg bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors resize-none text-sm"
              />
              {model !== 'gpt-4o-mini-tts' && instructions.trim() && (
                <p className="text-xs text-yellow-500 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Instructions werden nur von gpt-4o-mini-tts unterstützt.
                </p>
              )}
            </div>
          </div>

          {/* Settings */}
          <div className="bg-card rounded-xl border border-border p-6 space-y-5">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" />
              Einstellungen
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Voice */}
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                  Stimme
                </label>
                <select
                  value={voice}
                  onChange={(e) => setVoice(e.target.value as TtsVoice)}
                  className="w-full px-3 py-2.5 rounded-lg bg-background border border-border focus:border-primary outline-none transition-colors"
                >
                  {Object.entries(TTS_VOICES).map(([key, value]) => (
                    <option key={key} value={value}>
                      {value} – {VOICE_DESCRIPTIONS[value] || ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Model */}
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                  Modell
                </label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value as TtsModel)}
                  className="w-full px-3 py-2.5 rounded-lg bg-background border border-border focus:border-primary outline-none transition-colors"
                >
                  {Object.entries(TTS_MODELS).map(([key, value]) => (
                    <option key={key} value={value}>
                      {value} – {MODEL_DESCRIPTIONS[value]}
                    </option>
                  ))}
                </select>
              </div>

              {/* Speed */}
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                  Geschwindigkeit: {speed.toFixed(2)}x
                </label>
                <input
                  type="range"
                  min="0.25"
                  max="4.0"
                  step="0.05"
                  value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
                  <span>0.25x</span>
                  <button
                    onClick={() => setSpeed(1.0)}
                    className="text-primary hover:underline"
                  >
                    Reset
                  </button>
                  <span>4.0x</span>
                </div>
              </div>

              {/* Filename */}
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                  Dateiname (ohne .mp3)
                </label>
                <input
                  type="text"
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                  placeholder="tts-snippet"
                  className="w-full px-3 py-2.5 rounded-lg bg-background border border-border focus:border-primary outline-none transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !text.trim()}
            className={cn(
              'w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-all',
              isGenerating || !text.trim()
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : 'bg-gradient-to-r from-primary to-secondary text-primary-foreground hover:opacity-90 shadow-lg shadow-primary/25'
            )}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Generiere...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Audio generieren
              </>
            )}
          </button>

          {/* Error */}
          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}
        </div>

        {/* Right Column: Generated Snippets */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Volume2 className="w-5 h-5 text-primary" />
              Generierte Schnipsel
            </span>
            <span className="text-sm font-normal text-muted-foreground">
              {snippets.length} Stück
            </span>
          </h2>

          {snippets.length === 0 ? (
            <div className="bg-card rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
              <Volume2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Noch keine Schnipsel generiert.</p>
              <p className="text-xs mt-1">Gib einen Text ein und klicke &quot;Audio generieren&quot;.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[calc(100vh-200px)] overflow-y-auto pr-1">
              {snippets.map((snippet) => (
                <SnippetCard
                  key={snippet.id}
                  snippet={snippet}
                  isPlaying={playingId === snippet.id}
                  onPlay={() => handlePlay(snippet)}
                  onDownload={() => handleDownload(snippet)}
                  onDelete={() => handleDelete(snippet.id)}
                />
              ))}
            </div>
          )}

          {/* Hint */}
          <div className="p-4 rounded-xl bg-cyan-500/5 border border-cyan-500/20 text-sm text-muted-foreground">
            <p className="font-medium text-cyan-400 mb-1">💡 Tipp</p>
            <p>
              Heruntergeladene MP3s nach <code className="px-1 py-0.5 rounded bg-muted text-xs font-mono">public/audio/tts/</code> verschieben
              und in der <code className="px-1 py-0.5 rounded bg-muted text-xs font-mono">audioRegistry.ts</code> registrieren
              um sie als statische Sounds im Spiel zu nutzen.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// SNIPPET CARD
// ============================================

function SnippetCard({
  snippet,
  isPlaying,
  onPlay,
  onDownload,
  onDelete,
}: {
  snippet: GeneratedSnippet;
  isPlaying: boolean;
  onPlay: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const sizeKB = (snippet.audioBlob.size / 1024).toFixed(1);

  return (
    <div className="bg-card rounded-xl border border-border p-4 space-y-3 hover:border-primary/20 transition-colors">
      {/* Text preview */}
      <p className="text-sm font-medium leading-snug line-clamp-2">{snippet.text}</p>

      {/* Meta */}
      <div className="flex flex-wrap gap-1.5">
        <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
          {snippet.voice}
        </span>
        <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs">
          {snippet.model}
        </span>
        {snippet.speed !== 1.0 && (
          <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs">
            {snippet.speed}x
          </span>
        )}
        <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-xs">
          {sizeKB} KB
        </span>
      </div>

      {/* Filename */}
      <p className="text-xs text-muted-foreground font-mono">
        {snippet.filename}.mp3
      </p>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onPlay}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors',
            isPlaying
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
              : 'bg-primary/10 text-primary hover:bg-primary/20'
          )}
        >
          {isPlaying ? (
            <>
              <Square className="w-4 h-4" /> Stop
            </>
          ) : (
            <>
              <Play className="w-4 h-4" /> Play
            </>
          )}
        </button>
        <button
          onClick={onDownload}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 text-sm font-medium transition-colors"
          title="Download"
        >
          <Download className="w-4 h-4" />
        </button>
        <button
          onClick={onDelete}
          className="flex items-center justify-center px-3 py-2 rounded-lg bg-muted hover:bg-red-500/10 hover:text-red-400 text-muted-foreground text-sm transition-colors"
          title="Löschen"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ============================================
// HELPERS
// ============================================

function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'tts-snippet';
}
