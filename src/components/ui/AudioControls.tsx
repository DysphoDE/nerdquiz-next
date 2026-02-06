'use client';

/**
 * AudioControls - Schwebendes Audio-Widget
 * 
 * Kompakter Mute-Button mit expandierbarem Volume-Panel.
 * Zeigt Slider für Master, Musik und SFX.
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, VolumeX, Music, Zap, SlidersHorizontal, Mic } from 'lucide-react';
import { useAudio } from '@/hooks/useAudio';
import { cn } from '@/lib/utils';

interface VolumeSliderProps {
  label: string;
  icon: React.ReactNode;
  value: number;
  onChange: (value: number) => void;
}

function VolumeSlider({ label, icon, value, onChange }: VolumeSliderProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-muted-foreground w-5 flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className="text-xs font-mono text-muted-foreground w-8 text-right">
            {Math.round(value * 100)}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(value * 100)}
          onChange={(e) => onChange(Number(e.target.value) / 100)}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer
            bg-muted
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-3.5
            [&::-webkit-slider-thumb]:h-3.5
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-primary
            [&::-webkit-slider-thumb]:shadow-[0_0_6px_hsl(var(--primary)/0.5)]
            [&::-webkit-slider-thumb]:transition-transform
            [&::-webkit-slider-thumb]:hover:scale-125
            [&::-moz-range-thumb]:w-3.5
            [&::-moz-range-thumb]:h-3.5
            [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-primary
            [&::-moz-range-thumb]:border-0
            [&::-moz-range-thumb]:shadow-[0_0_6px_hsl(var(--primary)/0.5)]
            [&::-webkit-slider-runnable-track]:rounded-full
            [&::-moz-range-track]:rounded-full"
          style={{
            background: `linear-gradient(to right, hsl(var(--primary)) 0%, hsl(var(--primary)) ${value * 100}%, hsl(var(--muted)) ${value * 100}%, hsl(var(--muted)) 100%)`,
          }}
        />
      </div>
    </div>
  );
}

export function AudioControls() {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const {
    isMuted,
    masterVolume,
    musicVolume,
    sfxVolume,
    ttsVolume,
    toggleMute,
    setMasterVolume,
    setMusicVolume,
    setSfxVolume,
    setTtsVolume,
  } = useAudio();

  // Close panel when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col items-end gap-2">
      {/* Mute/Settings Button */}
      <button
        ref={buttonRef}
        onClick={() => {
          // Short press = toggle mute, long press could open panel
          // For now: click toggles panel, icon area toggles mute
          setIsOpen((prev) => !prev);
        }}
        className={cn(
          'group relative flex items-center justify-center',
          'w-10 h-10 rounded-full',
          'bg-card/80 backdrop-blur-md border border-border/50',
          'hover:bg-card hover:border-primary/30',
          'transition-all duration-200',
          'shadow-lg shadow-black/20',
          isOpen && 'bg-card border-primary/30'
        )}
        title={isMuted ? 'Ton einschalten' : 'Ton ausschalten'}
      >
        {isMuted ? (
          <VolumeX className="w-4.5 h-4.5 text-muted-foreground" />
        ) : (
          <Volume2 className="w-4.5 h-4.5 text-primary" />
        )}

        {/* Pulse indicator when audio is active */}
        {!isMuted && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary animate-pulse" />
        )}
      </button>

      {/* Expandable Volume Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className={cn(
              'w-56 p-4 rounded-xl',
              'bg-card/95 backdrop-blur-xl',
              'border border-border/50',
              'shadow-xl shadow-black/30',
            )}
          >
            {/* Header with Mute Toggle */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-foreground">Audio</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMute();
                }}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                  isMuted
                    ? 'bg-destructive/15 text-destructive hover:bg-destructive/25'
                    : 'bg-primary/15 text-primary hover:bg-primary/25'
                )}
              >
                {isMuted ? (
                  <>
                    <VolumeX className="w-3.5 h-3.5" />
                    Stumm
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3.5 h-3.5" />
                    An
                  </>
                )}
              </button>
            </div>

            {/* Volume Sliders */}
            <div className={cn(
              'space-y-3',
              isMuted && 'opacity-40 pointer-events-none'
            )}>
              <VolumeSlider
                label="Master"
                icon={<SlidersHorizontal className="w-4 h-4" />}
                value={masterVolume}
                onChange={setMasterVolume}
              />
              <VolumeSlider
                label="Musik"
                icon={<Music className="w-4 h-4" />}
                value={musicVolume}
                onChange={setMusicVolume}
              />
              <VolumeSlider
                label="Effekte"
                icon={<Zap className="w-4 h-4" />}
                value={sfxVolume}
                onChange={setSfxVolume}
              />
              <VolumeSlider
                label="Moderator"
                icon={<Mic className="w-4 h-4" />}
                value={ttsVolume}
                onChange={setTtsVolume}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
