'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const EMOJI_SUGGESTIONS = ['🎮', '🎬', '📚', '🔬', '⚽', '🎵', '🌍', '🎨', '🚀', '🎯', '🃏', '🧙‍♂️'];
const COLOR_SUGGESTIONS = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316'];

export default function NewCategoryPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('🎯');
  const [color, setColor] = useState('#6366f1');

  const generateSlug = (value: string) => {
    return value
      .toLowerCase()
      .replace(/[äÄ]/g, 'ae')
      .replace(/[öÖ]/g, 'oe')
      .replace(/[üÜ]/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  };

  const handleNameChange = (value: string) => {
    setName(value);
    if (!slug || slug === generateSlug(name)) {
      setSlug(generateSlug(value));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch('/api/admin/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          slug,
          description: description || undefined,
          icon,
          color,
          isActive: true,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Fehler beim Speichern');
      }

      router.push('/admin/categories');
    } catch (error: any) {
      alert(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link href="/admin/categories">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Zurück
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Neue Kategorie</h1>
          <p className="text-muted-foreground">Erstelle eine neue Quiz-Kategorie</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Preview */}
        <div className="bg-card rounded-xl border border-border p-6">
          <h2 className="text-sm font-medium text-muted-foreground mb-4">Vorschau</h2>
          <div className="flex items-center gap-4">
            <div 
              className="w-16 h-16 rounded-xl flex items-center justify-center text-3xl"
              style={{ backgroundColor: `${color}20` }}
            >
              {icon}
            </div>
            <div>
              <h3 className="text-xl font-bold">{name || 'Kategoriename'}</h3>
              <p className="text-sm text-muted-foreground">{slug || 'kategorie_slug'}</p>
            </div>
          </div>
        </div>

        {/* Form Fields */}
        <div className="bg-card rounded-xl border border-border p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="text-sm font-medium mb-2 block">
              Name *
            </label>
            <Input
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="z.B. Gaming"
              required
            />
          </div>

          {/* Slug */}
          <div>
            <label className="text-sm font-medium mb-2 block">
              Slug * <span className="text-muted-foreground font-normal">(URL-freundlich)</span>
            </label>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              placeholder="z.B. gaming"
              pattern="^[a-z0-9_]+$"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-sm font-medium mb-2 block">
              Beschreibung
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 min-h-[80px] resize-y"
              placeholder="Kurze Beschreibung der Kategorie..."
            />
          </div>

          {/* Icon */}
          <div>
            <label className="text-sm font-medium mb-2 block">
              Icon (Emoji) *
            </label>
            <div className="flex gap-2 flex-wrap mb-2">
              {EMOJI_SUGGESTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setIcon(emoji)}
                  className={cn(
                    'w-10 h-10 rounded-lg border-2 text-xl transition-colors',
                    icon === emoji
                      ? 'border-primary bg-primary/20'
                      : 'border-border hover:border-muted-foreground'
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <Input
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="Emoji eingeben"
              maxLength={10}
              className="w-24"
            />
          </div>

          {/* Color */}
          <div>
            <label className="text-sm font-medium mb-2 block">
              Farbe
            </label>
            <div className="flex gap-2 flex-wrap mb-2">
              {COLOR_SUGGESTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    'w-10 h-10 rounded-lg border-2 transition-transform',
                    color === c
                      ? 'border-white scale-110'
                      : 'border-transparent hover:scale-105'
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <Input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-24 h-10 p-1"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-4">
          <Link href="/admin/categories">
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



