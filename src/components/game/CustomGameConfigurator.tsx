'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import {
  Plus,
  X,
  Check,
  HelpCircle,
  Clock,
  Settings2,
  GripVertical,
  ChevronRight,
  ChevronDown,
  Loader2,
} from 'lucide-react';
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
import type { CustomRoundConfig, RoundType } from '@/config/customGame.shared';
import {
  ROUND_TYPES_DATA,
  ROUND_TYPE_DATA_MAP,
  createQuestionRound,
  createHotButtonRound,
  createCollectiveListRound,
} from '@/config/customGame.shared';
import { CATEGORY_SELECTION_MODES_DATA } from '@/config/gameModes.shared';
import type { CategorySelectionMode } from '@/config/gameModes.shared';

// ============================================
// TYPES
// ============================================

interface CollectiveListInfo {
  id: string;
  topic: string;
  itemCount: number;
  category?: string;
  categoryIcon?: string;
}

interface CustomGameConfiguratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rounds: CustomRoundConfig[];
  onChange: (rounds: CustomRoundConfig[]) => void;
  questionsPerRound: number;
  onQuestionsPerRoundChange: (value: number) => void;
}

// ============================================
// HOOKS
// ============================================

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

// ============================================
// CATEGORY MODES HELPER
// ============================================

const CATEGORY_MODES: Array<{ id: CategorySelectionMode | 'random'; name: string; emoji: string }> = [
  { id: 'random', name: 'Zufall', emoji: '🎲' },
  ...CATEGORY_SELECTION_MODES_DATA.map(m => ({
    id: m.id as CategorySelectionMode,
    name: m.name,
    emoji: m.emoji,
  })),
];

function getCategoryModeName(mode: CategorySelectionMode | 'random' | undefined): string {
  if (!mode || mode === 'random') return '';
  return CATEGORY_MODES.find(m => m.id === mode)?.name || '';
}

// ============================================
// ROUND NODE COMPONENT (Flow Node)
// ============================================

function RoundNode({
  round,
  index,
  totalRounds,
  isSelected,
  onSelect,
  onRemove,
  onTypeChange,
  onCategoryModeChange,
  onListSelectionChange,
  collectiveLists,
  listsLoading,
  dragControls,
}: {
  round: CustomRoundConfig;
  index: number;
  totalRounds: number;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onTypeChange: (type: RoundType) => void;
  onCategoryModeChange: (mode: CategorySelectionMode | 'random') => void;
  onListSelectionChange: (questionId: string | undefined, listName: string | undefined) => void;
  collectiveLists: CollectiveListInfo[];
  listsLoading: boolean;
  dragControls: ReturnType<typeof useDragControls>;
}) {
  const roundType = ROUND_TYPE_DATA_MAP.get(round.type);
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  
  // Close menu when clicking outside
  useEffect(() => {
    if (!showTypeMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowTypeMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showTypeMenu]);

  // Get category mode label if not random
  const categoryModeLabel = round.type === 'question_round' && round.categoryMode && round.categoryMode !== 'random'
    ? getCategoryModeName(round.categoryMode)
    : null;

  // Get specific list label
  const listLabel = round.type === 'collective_list' && round.specificListName
    ? round.specificListName
    : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      className="relative group"
      style={{ zIndex: showTypeMenu ? 50 : 1 }}
    >
      {/* Main Node */}
      <div
        onClick={onSelect}
        className={`relative flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${
          isSelected 
            ? 'bg-primary/10 ring-2 ring-primary shadow-lg' 
            : 'bg-muted/50 hover:bg-muted'
        }`}
      >
        {/* Drag Handle - Only this area triggers drag */}
        <div 
          className="cursor-grab active:cursor-grabbing text-muted-foreground/50 p-2 -m-1 touch-none select-none"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            dragControls.start(e);
          }}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-5 h-5" />
        </div>
        
        {/* Round Number & Icon */}
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${roundType?.color || 'from-gray-500 to-gray-600'} flex items-center justify-center text-white font-bold shadow-md flex-shrink-0`}>
          <span className="text-lg">{roundType?.emoji}</span>
        </div>
        
        {/* Round Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Runde {index + 1}</span>
            {/* Show category mode label if not random */}
            {categoryModeLabel && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                {categoryModeLabel}
              </span>
            )}
            {/* Show specific list name */}
            {listLabel && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium truncate max-w-[120px]">
                {listLabel}
              </span>
            )}
          </div>
          <p className="font-medium text-sm truncate">{roundType?.name || round.type}</p>
        </div>
        
        {/* Type Selector */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowTypeMenu(!showTypeMenu);
            }}
            className="p-1.5 rounded-lg hover:bg-background/50 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${showTypeMenu ? 'rotate-180' : ''}`} />
          </button>
          
          <AnimatePresence>
            {showTypeMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -5 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -5 }}
                className="absolute right-0 top-full mt-1 p-2 rounded-xl bg-background border shadow-2xl min-w-[180px]"
                style={{ zIndex: 100 }}
                onClick={(e) => e.stopPropagation()}
              >
                {ROUND_TYPES_DATA.filter(t => t.isAvailable).map((type) => (
                  <button
                    key={type.id}
                    onClick={() => {
                      onTypeChange(type.id);
                      setShowTypeMenu(false);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                      round.type === type.id 
                        ? 'bg-primary/10 text-primary' 
                        : 'hover:bg-muted'
                    }`}
                  >
                    <span className="text-base">{type.emoji}</span>
                    <span className="flex-1 text-left">{type.name}</span>
                    {round.type === type.id && <Check className="w-4 h-4" />}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        
        {/* Remove Button - Always visible on mobile */}
        {totalRounds > 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="p-1.5 rounded-lg md:opacity-0 md:group-hover:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      
      {/* Expanded Options for Question Rounds */}
      <AnimatePresence>
        {isSelected && round.type === 'question_round' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-2 pl-7">
              <p className="text-xs text-muted-foreground mb-2">Kategorieauswahl:</p>
              <div className="flex flex-wrap gap-1">
                {CATEGORY_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => onCategoryModeChange(mode.id)}
                    className={`px-2 py-1 rounded-lg text-xs font-medium transition-all ${
                      round.categoryMode === mode.id
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/50 hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    {mode.emoji} {mode.name}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expanded Options for Collective List Rounds */}
      <AnimatePresence>
        {isSelected && round.type === 'collective_list' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-2 pl-7">
              <p className="text-xs text-muted-foreground mb-2">Liste:</p>
              {listsLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Listen werden geladen...</span>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() => onListSelectionChange(undefined, undefined)}
                    className={`px-2 py-1 rounded-lg text-xs font-medium transition-all ${
                      !round.specificQuestionId
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/50 hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    🎲 Zufall
                  </button>
                  {collectiveLists.map((list) => (
                    <button
                      key={list.id}
                      onClick={() => onListSelectionChange(list.id, list.topic)}
                      title={`${list.topic} (${list.itemCount} Begriffe)${list.category ? ` — ${list.category}` : ''}`}
                      className={`px-2 py-1 rounded-lg text-xs font-medium transition-all truncate max-w-[200px] ${
                        round.specificQuestionId === list.id
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted/50 hover:bg-muted text-muted-foreground'
                      }`}
                    >
                      {list.categoryIcon ? `${list.categoryIcon} ` : ''}{list.topic}
                    </button>
                  ))}
                  {collectiveLists.length === 0 && (
                    <span className="text-xs text-muted-foreground py-1">Keine Listen verfügbar</span>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ============================================
// DRAGGABLE ROUND ITEM WRAPPER
// ============================================

function DraggableRoundItem({
  round,
  index,
  totalRounds,
  isSelected,
  onSelect,
  onRemove,
  onTypeChange,
  onCategoryModeChange,
  onListSelectionChange,
  collectiveLists,
  listsLoading,
  showAddButton,
  onAddAt,
}: {
  round: CustomRoundConfig;
  index: number;
  totalRounds: number;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onTypeChange: (type: RoundType) => void;
  onCategoryModeChange: (mode: CategorySelectionMode | 'random') => void;
  onListSelectionChange: (questionId: string | undefined, listName: string | undefined) => void;
  collectiveLists: CollectiveListInfo[];
  listsLoading: boolean;
  showAddButton: boolean;
  onAddAt: (type: RoundType) => void;
}) {
  const dragControls = useDragControls();

  return (
    <Reorder.Item
      key={round.id}
      value={round}
      dragListener={false}
      dragControls={dragControls}
    >
      <RoundNode
        round={round}
        index={index}
        totalRounds={totalRounds}
        isSelected={isSelected}
        onSelect={onSelect}
        onRemove={onRemove}
        onTypeChange={onTypeChange}
        onCategoryModeChange={onCategoryModeChange}
        onListSelectionChange={onListSelectionChange}
        collectiveLists={collectiveLists}
        listsLoading={listsLoading}
        dragControls={dragControls}
      />
      {/* Add between nodes */}
      {showAddButton && (
        <AddRoundButton onAdd={onAddAt} />
      )}
    </Reorder.Item>
  );
}

// ============================================
// ADD ROUND BUTTON (With Labels)
// ============================================

function AddRoundButton({ onAdd }: { onAdd: (type: RoundType) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative flex justify-center py-1.5" ref={menuRef}>
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
          isOpen 
            ? 'bg-primary text-primary-foreground' 
            : 'bg-muted/50 text-muted-foreground hover:bg-primary/20 hover:text-primary'
        }`}
      >
        <Plus className="w-4 h-4" />
      </motion.button>
      
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 p-2 rounded-xl bg-background border shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex gap-2">
              {ROUND_TYPES_DATA.filter(t => t.isAvailable).map((type) => (
                <motion.button
                  key={type.id}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    onAdd(type.id);
                    setIsOpen(false);
                  }}
                  className="flex flex-col items-center gap-1.5 p-2 rounded-lg hover:bg-muted transition-colors min-w-[70px]"
                >
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${type.color} flex items-center justify-center text-white shadow-md`}>
                    <span className="text-lg">{type.emoji}</span>
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">{type.name}</span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================
// GAME SUMMARY
// ============================================

function GameSummary({ rounds, questionsPerRound }: { rounds: CustomRoundConfig[]; questionsPerRound: number }) {
  const questionRounds = rounds.filter(r => r.type === 'question_round').length;
  const hotButtonRounds = rounds.filter(r => r.type === 'hot_button').length;
  const collectiveListRounds = rounds.filter(r => r.type === 'collective_list').length;
  
  const totalQuestions = questionRounds * questionsPerRound;
  const estimatedMinutes = Math.round(
    (totalQuestions * 0.5) + 
    (hotButtonRounds * 3) + 
    (collectiveListRounds * 4)
  );

  return (
    <div className="flex items-center justify-center gap-3 py-2 px-3 rounded-lg bg-muted/30 text-xs sm:text-sm">
      <span><span className="font-bold text-primary">{rounds.length}</span> Runden</span>
      <span className="text-muted-foreground/50">·</span>
      <span><span className="font-bold text-primary">{totalQuestions}</span> Fragen</span>
      <span className="text-muted-foreground/50">·</span>
      <span><span className="font-bold text-amber-500">{hotButtonRounds + collectiveListRounds}</span> Bonus</span>
      <span className="text-muted-foreground/50 hidden sm:inline">·</span>
      <span className="hidden sm:inline">~{estimatedMinutes} Min</span>
    </div>
  );
}

// ============================================
// QUESTIONS PER ROUND CONTROL
// ============================================

function QuestionsControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const options = [3, 5, 7, 10];
  
  return (
    <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <HelpCircle className="w-4 h-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium">Fragen pro Runde</p>
          <p className="text-xs text-muted-foreground">Für alle Fragerunden</p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={`w-9 h-9 rounded-lg font-bold text-sm transition-all ${
              value === opt
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'bg-background hover:bg-muted text-muted-foreground'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================
// TEMPLATES
// ============================================

function Templates({ onApply }: { onApply: (template: string) => void }) {
  const templates = [
    { id: 'standard', name: 'Standard', emoji: '🎮', desc: '4 Quiz + 1 Bonus' },
    { id: 'bonus_heavy', name: 'Bonus-Mix', emoji: '🎉', desc: 'Abwechselnd' },
    { id: 'quiz_only', name: 'Nur Quiz', emoji: '📚', desc: 'Verschiedene Modi' },
  ];

  return (
    <div className="flex gap-1.5 sm:gap-2 flex-wrap">
      <span className="text-xs text-muted-foreground self-center hidden sm:inline">Schnellstart:</span>
      {templates.map((t) => (
        <button
          key={t.id}
          onClick={() => onApply(t.id)}
          className="px-2 py-1.5 sm:px-2.5 text-xs rounded-lg bg-muted/50 hover:bg-muted active:bg-muted/80 transition-colors flex items-center gap-1 sm:gap-1.5 min-h-[32px]"
          title={t.desc}
        >
          <span className="text-sm">{t.emoji}</span>
          <span className="hidden sm:inline">{t.name}</span>
        </button>
      ))}
    </div>
  );
}

// ============================================
// MAIN CONTENT
// ============================================

function ConfiguratorContent({
  rounds,
  onChange,
  questionsPerRound,
  onQuestionsPerRoundChange,
}: {
  rounds: CustomRoundConfig[];
  onChange: (rounds: CustomRoundConfig[]) => void;
  questionsPerRound: number;
  onQuestionsPerRoundChange: (value: number) => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [collectiveLists, setCollectiveLists] = useState<CollectiveListInfo[]>([]);
  const [listsLoading, setListsLoading] = useState(false);
  const listsLoadedRef = useRef(false);

  // Lazy-load collective lists when a collective_list round exists
  const hasCollectiveListRound = rounds.some(r => r.type === 'collective_list');
  useEffect(() => {
    if (!hasCollectiveListRound || listsLoadedRef.current) return;
    listsLoadedRef.current = true;
    setListsLoading(true);
    fetch('/api/collective-lists')
      .then(res => res.json())
      .then((data: CollectiveListInfo[]) => setCollectiveLists(data))
      .catch(() => setCollectiveLists([]))
      .finally(() => setListsLoading(false));
  }, [hasCollectiveListRound]);

  // Update a single round
  const handleUpdateRound = useCallback((index: number, updated: CustomRoundConfig) => {
    const newRounds = [...rounds];
    newRounds[index] = updated;
    onChange(newRounds);
  }, [rounds, onChange]);

  // Change round type
  const handleTypeChange = useCallback((index: number, newType: RoundType) => {
    const current = rounds[index];
    if (newType === 'question_round') {
      const { specificQuestionId, specificListName, ...rest } = current;
      handleUpdateRound(index, {
        ...rest,
        type: newType,
        categoryMode: current.categoryMode || 'random',
      });
    } else if (newType === 'collective_list') {
      const { categoryMode, questionsPerRound, ...rest } = current;
      handleUpdateRound(index, { ...rest, type: newType });
    } else {
      const { categoryMode, questionsPerRound, specificQuestionId, specificListName, ...rest } = current;
      handleUpdateRound(index, { ...rest, type: newType });
    }
  }, [rounds, handleUpdateRound]);

  // Change category mode
  const handleCategoryModeChange = useCallback((index: number, mode: CategorySelectionMode | 'random') => {
    const current = rounds[index];
    handleUpdateRound(index, { ...current, categoryMode: mode });
  }, [rounds, handleUpdateRound]);

  // Change list selection for collective_list rounds
  const handleListSelectionChange = useCallback((index: number, questionId: string | undefined, listName: string | undefined) => {
    const current = rounds[index];
    if (questionId) {
      handleUpdateRound(index, { ...current, specificQuestionId: questionId, specificListName: listName });
    } else {
      const { specificQuestionId, specificListName, ...rest } = current;
      handleUpdateRound(index, rest);
    }
  }, [rounds, handleUpdateRound]);

  // Remove a round
  const handleRemove = useCallback((index: number) => {
    if (rounds.length <= 1) return;
    onChange(rounds.filter((_, i) => i !== index));
    setSelectedIndex(null);
  }, [rounds, onChange]);

  // Add round at position
  const handleAddAt = useCallback((index: number, type: RoundType) => {
    if (rounds.length >= 20) return;
    
    let newRound: CustomRoundConfig;
    switch (type) {
      case 'hot_button':
        newRound = createHotButtonRound();
        break;
      case 'collective_list':
        newRound = createCollectiveListRound();
        break;
      default:
        newRound = createQuestionRound('random');
    }
    
    const newRounds = [...rounds];
    newRounds.splice(index, 0, newRound);
    onChange(newRounds);
  }, [rounds, onChange]);

  // Add at end
  const handleAddEnd = useCallback((type: RoundType) => {
    handleAddAt(rounds.length, type);
  }, [rounds.length, handleAddAt]);

  // Apply template
  const applyTemplate = useCallback((template: string) => {
    let newRounds: CustomRoundConfig[];
    
    switch (template) {
      case 'standard':
        newRounds = [
          createQuestionRound('random'),
          createQuestionRound('random'),
          createQuestionRound('random'),
          createQuestionRound('random'),
          createHotButtonRound(),
        ];
        break;
      case 'bonus_heavy':
        newRounds = [
          createQuestionRound('random'),
          createHotButtonRound(),
          createQuestionRound('random'),
          createCollectiveListRound(),
          createQuestionRound('random'),
        ];
        break;
      case 'quiz_only':
        newRounds = [
          createQuestionRound('voting'),
          createQuestionRound('wheel'),
          createQuestionRound('dice_royale'),
          createQuestionRound('voting'),
          createQuestionRound('random'),
        ];
        break;
      default:
        return;
    }
    
    onChange(newRounds);
    setSelectedIndex(null);
  }, [onChange]);

  // Reorder handler
  const handleReorder = useCallback((newOrder: CustomRoundConfig[]) => {
    onChange(newOrder);
  }, [onChange]);

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header with Templates */}
      <div className="flex items-center justify-between flex-shrink-0">
        <Templates onApply={applyTemplate} />
        <span className="text-xs text-muted-foreground">{rounds.length}/20</span>
      </div>

      {/* Questions per Round */}
      <div className="flex-shrink-0">
        <QuestionsControl value={questionsPerRound} onChange={onQuestionsPerRoundChange} />
      </div>
      
      {/* Round Flow - Scrollable area with padding for bottom menu */}
      <div className="flex-1 min-h-0 relative">
        <div className="absolute inset-0 overflow-y-auto overflow-x-visible pr-1 pb-16">
          <div className="space-y-1">
            {/* Add at start */}
            {rounds.length < 20 && (
              <AddRoundButton onAdd={(type) => handleAddAt(0, type)} />
            )}
            
            <Reorder.Group
              axis="y"
              values={rounds}
              onReorder={handleReorder}
              className="space-y-1"
            >
              {rounds.map((round, index) => (
                <DraggableRoundItem
                  key={round.id}
                  round={round}
                  index={index}
                  totalRounds={rounds.length}
                  isSelected={selectedIndex === index}
                  onSelect={() => setSelectedIndex(selectedIndex === index ? null : index)}
                  onRemove={() => handleRemove(index)}
                  onTypeChange={(type) => handleTypeChange(index, type)}
                  onCategoryModeChange={(mode) => handleCategoryModeChange(index, mode)}
                  onListSelectionChange={(qId, name) => handleListSelectionChange(index, qId, name)}
                  collectiveLists={collectiveLists}
                  listsLoading={listsLoading}
                  showAddButton={index < rounds.length - 1 && rounds.length < 20}
                  onAddAt={(type) => handleAddAt(index + 1, type)}
                />
              ))}
            </Reorder.Group>
            
            {/* Add at end */}
            {rounds.length < 20 && rounds.length > 0 && (
              <AddRoundButton onAdd={handleAddEnd} />
            )}
          </div>
        </div>
      </div>

      {/* Summary - Fixed at bottom */}
      <div className="flex-shrink-0">
        <GameSummary rounds={rounds} questionsPerRound={questionsPerRound} />
      </div>
    </div>
  );
}

// ============================================
// MAIN COMPONENT (Modal/Drawer)
// ============================================

export function CustomGameConfigurator({
  open,
  onOpenChange,
  rounds,
  onChange,
  questionsPerRound,
  onQuestionsPerRoundChange,
}: CustomGameConfiguratorProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  
  const content = (
    <ConfiguratorContent
      rounds={rounds}
      onChange={onChange}
      questionsPerRound={questionsPerRound}
      onQuestionsPerRoundChange={onQuestionsPerRoundChange}
    />
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent 
          className="w-[90vw] max-w-[800px] h-[80vh] max-h-[700px] flex flex-col" 
          showCloseButton={false}
        >
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-primary" />
              Spielablauf anpassen
            </DialogTitle>
            <DialogDescription>
              Erstelle deine eigene Rundenfolge. Ziehe zum Umsortieren, klicke zum Bearbeiten.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 min-h-0 overflow-hidden">
            {content}
          </div>
          
          <div className="flex justify-end gap-2 pt-4 border-t flex-shrink-0">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button onClick={() => onOpenChange(false)} className="gap-2">
              <Check className="w-4 h-4" />
              Fertig
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }
  
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="h-[85vh] flex flex-col">
        <DrawerHeader className="flex-shrink-0 py-3">
          <DrawerTitle className="flex items-center justify-center gap-2 text-base">
            <Settings2 className="w-4 h-4 text-primary" />
            Spielablauf anpassen
          </DrawerTitle>
        </DrawerHeader>
        
        <div className="px-4 flex-1 min-h-0 overflow-hidden">
          {content}
        </div>
        
        <DrawerFooter className="flex-shrink-0 pt-2 pb-6">
          <Button onClick={() => onOpenChange(false)} className="gap-2">
            <Check className="w-4 h-4" />
            Fertig
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

// ============================================
// MINI PREVIEW (for Lobby)
// ============================================

interface RoundSequencePreviewProps {
  rounds: CustomRoundConfig[];
  onClick?: () => void;
  showEditHint?: boolean;
}

export function RoundSequencePreview({ rounds, onClick, showEditHint = true }: RoundSequencePreviewProps) {
  const Wrapper = onClick ? 'button' : 'div';
  
  return (
    <Wrapper
      onClick={onClick}
      className={`flex items-center gap-1 p-2 rounded-xl bg-muted/30 w-full ${onClick ? 'hover:bg-muted/50 transition-colors cursor-pointer' : ''}`}
    >
      <div className="flex -space-x-1 flex-1 overflow-hidden">
        {rounds.slice(0, 10).map((round, idx) => {
          const type = ROUND_TYPE_DATA_MAP.get(round.type);
          return (
            <motion.div
              key={round.id}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: idx * 0.03 }}
              className={`w-7 h-7 rounded-lg bg-gradient-to-br ${type?.color || 'from-gray-500 to-gray-600'} flex items-center justify-center text-white text-sm border-2 border-background flex-shrink-0`}
              title={`${idx + 1}. ${type?.name}`}
            >
              {type?.emoji}
            </motion.div>
          );
        })}
        {rounds.length > 10 && (
          <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground border-2 border-background flex-shrink-0">
            +{rounds.length - 10}
          </div>
        )}
      </div>
      {onClick && showEditHint && (
        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      )}
    </Wrapper>
  );
}
