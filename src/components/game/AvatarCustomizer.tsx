'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { 
  Palette, 
  Sparkles, 
  Check, 
  RotateCcw,
  Dices,
  ChevronLeft,
  ChevronRight,
  User,
  Smile,
} from 'lucide-react';

// Dylan Avatar Options based on DiceBear documentation
// Note: mood is NOT stored here - it's set dynamically by the game based on context
export interface DylanAvatarOptions {
  hair: string;
  hairColor: string;
  skinColor: string;
  backgroundColor: string;
  facialHair?: string; // Optional beard
}

// All available options for Dylan style (from official docs)
const HAIR_OPTIONS = [
  'bangs', 'buns', 'flatTop', 'fluffy', 'longCurls', 'parting',
  'plain', 'roundBob', 'shaggy', 'shortCurls', 'spiky', 'wavy'
];

const FACIAL_HAIR_OPTIONS = [
  { value: '', label: 'Kein Bart' },
  { value: 'default', label: 'Bart' },
];

const SKIN_COLORS = [
  { name: 'Hell', value: 'fce4d6' },
  { name: 'Beige', value: 'ffd6c0' },
  { name: 'Beige 2', value: 'e8c4a0' },
  { name: 'Mittel', value: 'c9a06b' },
  { name: 'Braun', value: 'c26450' },
  { name: 'Braun 2', value: 'a67c52' },
  { name: 'Dunkel', value: '8d5524' },
  { name: 'Dunkelbraun', value: '614335' },
  { name: 'Sehr dunkel', value: '3a2a1d' },
];

const HAIR_COLORS = [
  { name: 'Schwarz', value: '000000' },
  { name: 'Dunkelbraun', value: '3d2314' },
  { name: 'Braun', value: '7b4b2a' },
  { name: 'Hellbraun', value: 'a67c52' },
  { name: 'Blond', value: 'daa520' },
  { name: 'Platinblond', value: 'f0e68c' },
  { name: 'Rot', value: 'b22222' },
  { name: 'Kupfer', value: 'cd7f32' },
  { name: 'Orange', value: 'ff6347' },
  { name: 'Pink', value: 'ff69b4' },
  { name: 'Magenta', value: 'ff1493' },
  { name: 'Lila', value: '9370db' },
  { name: 'Violett', value: '8b00ff' },
  { name: 'Dunkelblau', value: '00008b' },
  { name: 'Blau', value: '4169e1' },
  { name: 'Türkis', value: '40e0d0' },
  { name: 'Dunkelgrün', value: '006400' },
  { name: 'Grün', value: '228b22' },
  { name: 'Lime', value: '32cd32' },
  { name: 'Grau', value: '808080' },
  { name: 'Silber', value: 'c0c0c0' },
  { name: 'Weiß', value: 'f5f5f5' },
];

const BACKGROUND_COLORS = [
  { name: 'Weiß', value: 'ffffff' },
  { name: 'Hellgrau', value: 'f0f0f0' },
  { name: 'Grau', value: 'd3d3d3' },
  { name: 'Dunkelgrau', value: 'a9a9a9' },
  { name: 'Schwarz', value: '000000' },
  { name: 'Coral', value: 'ff7f7f' },
  { name: 'Rot', value: 'ff0000' },
  { name: 'Dunkelrot', value: '8b0000' },
  { name: 'Pfirsich', value: 'ffdab9' },
  { name: 'Orange', value: 'ffa500' },
  { name: 'Gelb', value: 'ffd700' },
  { name: 'Hellgelb', value: 'fff500' },
  { name: 'Mint', value: '98fb98' },
  { name: 'Hellgrün', value: 'b6e3f4' },
  { name: 'Grün', value: '008000' },
  { name: 'Türkis', value: '40e0d0' },
  { name: 'Teal', value: '008080' },
  { name: 'Himmelblau', value: '87ceeb' },
  { name: 'Hellblau', value: 'add8e6' },
  { name: 'Blau', value: '0000ff' },
  { name: 'Navy', value: '000080' },
  { name: 'Lavendel', value: 'e6e6fa' },
  { name: 'Lila', value: 'c0aede' },
  { name: 'Violett', value: 'dda0dd' },
  { name: 'Purple', value: '800080' },
  { name: 'Rosa', value: 'ffb6c1' },
  { name: 'Pink', value: 'ffd5dc' },
  { name: 'Hot Pink', value: 'ff69b4' },
];

const HAIR_LABELS: Record<string, string> = {
  bangs: 'Pony',
  buns: 'Dutts',
  flatTop: 'Flattop',
  fluffy: 'Flauschig',
  longCurls: 'Lange Locken',
  parting: 'Scheitel',
  plain: 'Schlicht',
  roundBob: 'Runder Bob',
  shaggy: 'Zerzaust',
  shortCurls: 'Kurze Locken',
  spiky: 'Stachelig',
  wavy: 'Wellig',
};

const MOOD_LABELS: Record<string, string> = {
  angry: 'Wütend',
  confused: 'Verwirrt',
  happy: 'Fröhlich',
  hopeful: 'Hoffnungsvoll',
  neutral: 'Neutral',
  sad: 'Traurig',
  superHappy: 'Super Happy',
};

const MOOD_EMOJIS: Record<string, string> = {
  angry: '😠',
  confused: '😕',
  happy: '😊',
  hopeful: '🤗',
  neutral: '😐',
  sad: '😢',
  superHappy: '🤩',
};

// Local storage key
const AVATAR_STORAGE_KEY = 'nerdquiz_avatar_options';

// Default options
export const DEFAULT_AVATAR_OPTIONS: DylanAvatarOptions = {
  hair: 'wavy',
  hairColor: '3d2314',
  skinColor: 'e8c4a0',
  backgroundColor: 'ffffff',
  facialHair: '',
};

// Get saved options from localStorage
export function getSavedAvatarOptions(): DylanAvatarOptions | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem(AVATAR_STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    console.warn('Failed to load avatar options from localStorage');
  }
  return null;
}

// Save options to localStorage
export function saveAvatarOptions(options: DylanAvatarOptions): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(AVATAR_STORAGE_KEY, JSON.stringify(options));
  } catch {
    console.warn('Failed to save avatar options to localStorage');
  }
}

// Generate avatar URL from options
export function generateAvatarUrl(options: DylanAvatarOptions, mood: string = 'happy'): string {
  const params = new URLSearchParams();
  params.set('hair', options.hair);
  params.set('hairColor', options.hairColor);
  params.set('mood', mood);
  params.set('skinColor', options.skinColor);
  if (options.backgroundColor !== 'transparent') {
    params.set('backgroundColor', options.backgroundColor);
  }
  // facialHair must be set as array parameter
  if (options.facialHair && options.facialHair !== '') {
    params.set('facialHair', options.facialHair);
    // Set probability to 100 to ensure it shows
    params.set('facialHairProbability', '100');
  }
  return `https://api.dicebear.com/9.x/dylan/svg?${params.toString()}`;
}

// Convert options to a seed-like string for server compatibility
export function optionsToSeed(options: DylanAvatarOptions): string {
  return JSON.stringify(options);
}

// Parse seed back to options (if it's JSON) or return null
export function seedToOptions(seed: string): DylanAvatarOptions | null {
  try {
    const parsed = JSON.parse(seed);
    if (parsed.hair && parsed.skinColor && parsed.hairColor) {
      return parsed as DylanAvatarOptions;
    }
  } catch {
    // Not JSON, probably a regular seed
  }
  return null;
}

// Get avatar URL from seed (handles both old seeds and new options)
export function getAvatarUrlFromSeed(seed: string, overrideMood?: string): string {
  const options = seedToOptions(seed);
  if (options) {
    // Use override mood if provided, otherwise default to 'happy'
    const mood = overrideMood || 'happy';
    return generateAvatarUrl(options, mood);
  }
  // Fallback to old seed-based URL
  const mood = overrideMood || 'happy';
  return `https://api.dicebear.com/9.x/dylan/svg?seed=${encodeURIComponent(seed)}&mood=${mood}`;
}

// Hook for responsive detection
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  
  useEffect(() => {
    const media = window.matchMedia(query);
    setMatches(media.matches);
    
    const listener = (e: MediaQueryListEvent) => setMatches(e.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [query]);
  
  return matches;
}

interface AvatarCustomizerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (options: DylanAvatarOptions) => void;
  initialOptions?: DylanAvatarOptions;
}

type TabType = 'hair' | 'colors';

export function AvatarCustomizer({ 
  open, 
  onOpenChange, 
  onSave,
  initialOptions,
}: AvatarCustomizerProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [activeTab, setActiveTab] = useState<TabType>('hair');
  const [options, setOptions] = useState<DylanAvatarOptions>(
    initialOptions || getSavedAvatarOptions() || DEFAULT_AVATAR_OPTIONS
  );
  
  // Reset options when opening
  useEffect(() => {
    if (open) {
      setOptions(initialOptions || getSavedAvatarOptions() || DEFAULT_AVATAR_OPTIONS);
    }
  }, [open, initialOptions]);
  
  const avatarUrl = useMemo(() => generateAvatarUrl(options, 'happy'), [options]);
  
  const updateOption = useCallback(<K extends keyof DylanAvatarOptions>(
    key: K, 
    value: DylanAvatarOptions[K]
  ) => {
    setOptions(prev => ({ ...prev, [key]: value }));
  }, []);
  
  const randomize = useCallback(() => {
    setOptions({
      hair: HAIR_OPTIONS[Math.floor(Math.random() * HAIR_OPTIONS.length)],
      hairColor: HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)].value,
      skinColor: SKIN_COLORS[Math.floor(Math.random() * SKIN_COLORS.length)].value,
      backgroundColor: BACKGROUND_COLORS[Math.floor(Math.random() * BACKGROUND_COLORS.length)].value,
      facialHair: Math.random() > 0.7 ? 'default' : '', // 30% chance for facial hair
    });
  }, []);
  
  const reset = useCallback(() => {
    setOptions(DEFAULT_AVATAR_OPTIONS);
  }, []);
  
  const handleSave = useCallback(() => {
    saveAvatarOptions(options);
    onSave(options);
    onOpenChange(false);
  }, [options, onSave, onOpenChange]);
  
  const tabs: { id: TabType; label: string; icon: React.ElementType }[] = [
    { id: 'hair', label: 'Stil', icon: User },
    { id: 'colors', label: 'Farben', icon: Palette },
  ];
  
  const content = (
    <div className="flex flex-col gap-4">
      {/* Avatar Preview */}
      <div className="flex justify-center py-4">
        <motion.div 
          className="relative"
          key={avatarUrl}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        >
          <div className="w-32 h-32 rounded-2xl overflow-hidden bg-muted shadow-xl ring-4 ring-primary/20">
            <img 
              src={avatarUrl} 
              alt="Avatar Preview" 
              className="w-full h-full"
            />
          </div>
          <motion.div
            className="absolute -bottom-2 -right-2 text-2xl"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            😊
          </motion.div>
        </motion.div>
      </div>
      
      {/* Quick Actions */}
      <div className="flex justify-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={randomize}
          className="gap-2"
        >
          <Dices className="w-4 h-4" />
          Zufällig
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={reset}
          className="gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          Zurücksetzen
        </Button>
      </div>
      
      {/* Tabs */}
      <div className="flex justify-center gap-1 p-1 bg-muted rounded-xl">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>
      
      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="min-h-[200px] max-h-[300px] overflow-y-auto px-1"
        >
          {activeTab === 'hair' && (
            <div className="space-y-4">
              {/* Hair Style */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Frisur
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {HAIR_OPTIONS.map((hair) => (
                    <motion.button
                      key={hair}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => updateOption('hair', hair)}
                      className={`relative p-2 rounded-xl text-center transition-all ${
                        options.hair === hair
                          ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2'
                          : 'bg-muted hover:bg-muted/80'
                      }`}
                    >
                      <span className="text-xs font-medium">{HAIR_LABELS[hair]}</span>
                      {options.hair === hair && (
                        <motion.div
                          layoutId="hair-check"
                          className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center"
                        >
                          <Check className="w-2.5 h-2.5 text-white" />
                        </motion.div>
                      )}
                    </motion.button>
                  ))}
                </div>
              </div>
              
              {/* Facial Hair */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Gesichtsbehaarung
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {FACIAL_HAIR_OPTIONS.map((option) => (
                    <motion.button
                      key={option.value}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => updateOption('facialHair', option.value)}
                      className={`relative p-2 rounded-xl text-center transition-all ${
                        options.facialHair === option.value
                          ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2'
                          : 'bg-muted hover:bg-muted/80'
                      }`}
                    >
                      <span className="text-xs font-medium">{option.label}</span>
                      {options.facialHair === option.value && (
                        <motion.div
                          layoutId="facial-hair-check"
                          className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center"
                        >
                          <Check className="w-2.5 h-2.5 text-white" />
                        </motion.div>
                      )}
                    </motion.button>
                  ))}
                </div>
              </div>
            </div>
          )}
          
          
          {activeTab === 'colors' && (
            <div className="space-y-4">
              {/* Hair Color */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Haarfarbe
                </label>
                <div className="flex flex-wrap gap-2">
                  {HAIR_COLORS.map((color) => (
                    <motion.button
                      key={color.value}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => updateOption('hairColor', color.value)}
                      className={`w-8 h-8 rounded-full transition-all ${
                        options.hairColor === color.value
                          ? 'ring-2 ring-primary ring-offset-2'
                          : 'ring-1 ring-border hover:ring-2'
                      }`}
                      style={{ backgroundColor: `#${color.value}` }}
                      title={color.name}
                    >
                      {options.hairColor === color.value && (
                        <Check className={`w-4 h-4 mx-auto ${
                          ['000000', '3d2314', '614335', '3a2a1d'].includes(color.value)
                            ? 'text-white'
                            : 'text-black'
                        }`} />
                      )}
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Skin Color */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Hautfarbe
                </label>
                <div className="flex flex-wrap gap-2">
                  {SKIN_COLORS.map((color) => (
                    <motion.button
                      key={color.value}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => updateOption('skinColor', color.value)}
                      className={`w-8 h-8 rounded-full transition-all ${
                        options.skinColor === color.value
                          ? 'ring-2 ring-primary ring-offset-2'
                          : 'ring-1 ring-border hover:ring-2'
                      }`}
                      style={{ backgroundColor: `#${color.value}` }}
                      title={color.name}
                    >
                      {options.skinColor === color.value && (
                        <Check className={`w-4 h-4 mx-auto ${
                          ['614335', '3a2a1d', '8d5524', 'c26450'].includes(color.value)
                            ? 'text-white'
                            : 'text-black/50'
                        }`} />
                      )}
                    </motion.button>
                  ))}
                </div>
              </div>
              
              {/* Background Color */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Hintergrundfarbe
                </label>
                <div className="flex flex-wrap gap-2">
                  {BACKGROUND_COLORS.map((color) => (
                    <motion.button
                      key={color.value}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => updateOption('backgroundColor', color.value)}
                      className={`w-8 h-8 rounded-full transition-all ${
                        options.backgroundColor === color.value
                          ? 'ring-2 ring-primary ring-offset-2'
                          : 'ring-1 ring-border hover:ring-2'
                      }`}
                      style={{ 
                        backgroundColor: `#${color.value}`,
                      }}
                      title={color.name}
                    >
                      {options.backgroundColor === color.value && (
                        <Check className={`w-4 h-4 mx-auto ${
                          ['000000', '8b0000', '000080', '006400'].includes(color.value)
                            ? 'text-white'
                            : 'text-black'
                        }`} />
                      )}
                    </motion.button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
  
  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Avatar anpassen
            </DialogTitle>
            <DialogDescription>
              Gestalte deinen einzigartigen Avatar. Die Stimmung wird automatisch vom Spiel angepasst.
            </DialogDescription>
          </DialogHeader>
          {content}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleSave} className="gap-2">
              <Check className="w-4 h-4" />
              Speichern
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }
  
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader>
          <DrawerTitle className="flex items-center justify-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Avatar anpassen
          </DrawerTitle>
          <DrawerDescription className="text-center">
            Gestalte deinen einzigartigen Avatar. Die Stimmung wird automatisch vom Spiel angepasst.
          </DrawerDescription>
        </DrawerHeader>
        <div className="px-4 overflow-y-auto">
          {content}
        </div>
        <DrawerFooter>
          <Button onClick={handleSave} className="gap-2">
            <Check className="w-4 h-4" />
            Speichern
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

