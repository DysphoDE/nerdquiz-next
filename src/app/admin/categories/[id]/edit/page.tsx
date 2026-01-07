'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Link from 'next/link';

interface Category {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
}

export default function EditCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [category, setCategory] = useState<Category | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    icon: '',
    color: '',
    sortOrder: 0,
    isActive: true,
  });

  useEffect(() => {
    async function loadCategory() {
      try {
        const { id } = await params;
        setCategoryId(id);
        const response = await fetch(`/api/admin/categories/${id}`);
        if (!response.ok) {
          throw new Error('Kategorie nicht gefunden');
        }
        const data = await response.json();
        setCategory(data);
        setFormData({
          name: data.name,
          slug: data.slug,
          description: data.description || '',
          icon: data.icon,
          color: data.color || '',
          sortOrder: data.sortOrder,
          isActive: data.isActive,
        });
      } catch (error) {
        console.error('Failed to load category:', error);
        alert('Fehler beim Laden der Kategorie');
      } finally {
        setLoading(false);
      }
    }

    loadCategory();
  }, [params]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!categoryId) return;
    setSaving(true);

    try {
      const response = await fetch(`/api/admin/categories/${categoryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error('Fehler beim Speichern');
      }

      router.push('/admin/categories');
      router.refresh();
    } catch (error) {
      console.error('Failed to save category:', error);
      alert('Fehler beim Speichern der Kategorie');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!categoryId) return;
    if (!confirm('Möchtest du diese Kategorie wirklich löschen? Alle zugehörigen Fragen werden ebenfalls gelöscht.')) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/categories/${categoryId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Fehler beim Löschen');
      }

      router.push('/admin/categories');
      router.refresh();
    } catch (error) {
      console.error('Failed to delete category:', error);
      alert('Fehler beim Löschen der Kategorie');
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="max-w-2xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-muted rounded" />
            <div className="h-64 bg-card rounded-xl border" />
          </div>
        </div>
      </div>
    );
  }

  if (!category) {
    return (
      <div className="p-8">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-2xl font-bold">Kategorie nicht gefunden</h1>
          <Link href="/admin/categories" className="mt-4 inline-block">
            <Button>Zurück zur Übersicht</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/admin/categories">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Kategorie bearbeiten</h1>
            <p className="text-muted-foreground mt-1">
              Bearbeite die Details dieser Kategorie
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-card rounded-xl border border-border p-6 space-y-6">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Name *
              </label>
              <Input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="z.B. Gaming"
                required
              />
            </div>

            {/* Slug */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Slug * <span className="text-muted-foreground font-normal">(URL-freundlich, keine Leerzeichen)</span>
              </label>
              <Input
                type="text"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                placeholder="z.B. gaming"
                required
                pattern="^[a-z0-9_-]+$"
              />
            </div>

            {/* Icon */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Icon * <span className="text-muted-foreground font-normal">(Emoji)</span>
              </label>
              <div className="flex gap-3 items-center">
                <Input
                  type="text"
                  value={formData.icon}
                  onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                  placeholder="🎮"
                  required
                  className="max-w-[120px]"
                  maxLength={2}
                />
                <span className="text-4xl">{formData.icon}</span>
              </div>
            </div>

            {/* Color */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Farbe <span className="text-muted-foreground font-normal">(Hex-Code, optional)</span>
              </label>
              <div className="flex gap-3 items-center">
                <Input
                  type="text"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  placeholder="#6366f1"
                  pattern="^#[0-9A-Fa-f]{6}$"
                  className="max-w-[150px]"
                />
                {formData.color && (
                  <div
                    className="w-10 h-10 rounded border border-border"
                    style={{ backgroundColor: formData.color }}
                  />
                )}
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Beschreibung <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Kurze Beschreibung der Kategorie"
                className="w-full min-h-[100px] px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Sort Order */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Sortierung
              </label>
              <Input
                type="number"
                value={formData.sortOrder}
                onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
                min={0}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Niedrigere Zahlen werden zuerst angezeigt
              </p>
            </div>

            {/* Active Toggle */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="w-4 h-4 rounded border-input"
              />
              <label htmlFor="isActive" className="text-sm font-medium cursor-pointer">
                Kategorie aktiv
              </label>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              className="gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Löschen
            </Button>

            <div className="flex gap-3">
              <Link href="/admin/categories">
                <Button type="button" variant="ghost">
                  Abbrechen
                </Button>
              </Link>
              <Button type="submit" disabled={saving} className="gap-2">
                <Save className="w-4 h-4" />
                {saving ? 'Speichern...' : 'Speichern'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

