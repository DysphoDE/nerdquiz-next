/**
 * Zod-Validierung für Question Content
 * 
 * Da wir JSONB für flexible Frage-Inhalte nutzen,
 * validieren wir hier die Struktur je nach QuestionType.
 */

import { z } from 'zod';

// ============================================
// CONTENT SCHEMAS
// ============================================

/**
 * Multiple Choice: Eine richtige, mehrere falsche Antworten
 */
export const MultipleChoiceContentSchema = z.object({
  correctAnswer: z.string().min(1, 'Richtige Antwort darf nicht leer sein'),
  incorrectAnswers: z
    .array(z.string().min(1))
    .min(1, 'Mindestens eine falsche Antwort')
    .max(5, 'Maximal 5 falsche Antworten'),
});

/**
 * Estimation: Schätzfrage mit Zahlenwert
 */
export const EstimationContentSchema = z.object({
  correctValue: z.number(),
  unit: z.string().min(1, 'Einheit angeben'),
  tolerance: z.number().min(0).max(100).optional(), // Prozent-Toleranz
});

/**
 * True/False: Wahr oder Falsch
 */
export const TrueFalseContentSchema = z.object({
  correctAnswer: z.boolean(),
});

/**
 * Sorting: Elemente in richtige Reihenfolge bringen
 * Das Array ist in der KORREKTEN Reihenfolge gespeichert
 */
export const SortingContentSchema = z.object({
  items: z
    .array(z.string().min(1))
    .min(3, 'Mindestens 3 Elemente')
    .max(8, 'Maximal 8 Elemente'),
  labels: z.object({
    top: z.string(),
    bottom: z.string(),
  }).optional(),
});

/**
 * Text Input: Freitext-Eingabe (z.B. für Bildrätsel)
 */
export const TextInputContentSchema = z.object({
  acceptedAnswers: z
    .array(z.string().min(1))
    .min(1, 'Mindestens eine akzeptierte Antwort'),
  caseSensitive: z.boolean().default(false),
});

/**
 * Matching: Zuordnungsfrage (z.B. Zitat → Person)
 */
export const MatchingContentSchema = z.object({
  pairs: z
    .array(z.object({
      clue: z.string().min(1),
      match: z.string().min(1),
    }))
    .min(3, 'Mindestens 3 Paare')
    .max(6, 'Maximal 6 Paare'),
});

/**
 * Collective List: Bonusrunde - Spieler nennen nacheinander Items aus einer Liste
 * Beispiel: "Nenne alle US-Bundesstaaten"
 */
export const CollectiveListItemSchema = z.object({
  id: z.string().min(1),
  display: z.string().min(1), // Anzeigename
  aliases: z.array(z.string().min(1)).min(1), // Akzeptierte Schreibweisen
  group: z.string().optional(), // Optionale Gruppierung (z.B. "West", "Ost")
});

export const CollectiveListContentSchema = z.object({
  topic: z.string().min(1, 'Thema angeben'), // z.B. "US-Bundesstaaten"
  description: z.string().optional(), // z.B. "Nenne alle 50 Staaten"
  items: z
    .array(CollectiveListItemSchema)
    .min(5, 'Mindestens 5 Items')
    .max(500, 'Maximal 500 Items'),
  timePerTurn: z.number().min(5).max(60).default(15), // Sekunden pro Spielerzug
  fuzzyThreshold: z.number().min(0.5).max(1).default(0.85), // Mindest-Ähnlichkeit für Fuzzy-Match
  showGroupHeaders: z.boolean().default(false), // Gruppen im Grid anzeigen
});

/**
 * Hot Button: Bonusrunde - Buzzer-Runde mit schrittweise aufgebauter Frage
 * Beispiel: "Wie heißt die Hauptstadt von...?" (wird langsam aufgebaut)
 */
export const HotButtonContentSchema = z.object({
  correctAnswer: z.string().min(1, 'Richtige Antwort angeben'),
  acceptedAnswers: z
    .array(z.string().min(1))
    .min(1, 'Mindestens eine akzeptierte Antwort'),
  revealSpeed: z.number().min(10).max(200).default(50).optional(), // Millisekunden pro Zeichen
});

// ============================================
// TYPE EXPORTS
// ============================================

export type MultipleChoiceContent = z.infer<typeof MultipleChoiceContentSchema>;
export type EstimationContent = z.infer<typeof EstimationContentSchema>;
export type TrueFalseContent = z.infer<typeof TrueFalseContentSchema>;
export type SortingContent = z.infer<typeof SortingContentSchema>;
export type TextInputContent = z.infer<typeof TextInputContentSchema>;
export type MatchingContent = z.infer<typeof MatchingContentSchema>;
export type CollectiveListContent = z.infer<typeof CollectiveListContentSchema>;
export type CollectiveListItem = z.infer<typeof CollectiveListItemSchema>;
export type HotButtonContent = z.infer<typeof HotButtonContentSchema>;

// Union Type
export type QuestionContent =
  | MultipleChoiceContent
  | EstimationContent
  | TrueFalseContent
  | SortingContent
  | TextInputContent
  | MatchingContent
  | CollectiveListContent
  | HotButtonContent;

// ============================================
// VALIDATION HELPERS
// ============================================

export type QuestionType = 
  | 'MULTIPLE_CHOICE' 
  | 'ESTIMATION' 
  | 'TRUE_FALSE' 
  | 'SORTING' 
  | 'TEXT_INPUT' 
  | 'MATCHING'
  | 'COLLECTIVE_LIST'
  | 'HOT_BUTTON';

const contentSchemaMap: Record<QuestionType, z.ZodSchema> = {
  MULTIPLE_CHOICE: MultipleChoiceContentSchema,
  ESTIMATION: EstimationContentSchema,
  TRUE_FALSE: TrueFalseContentSchema,
  SORTING: SortingContentSchema,
  TEXT_INPUT: TextInputContentSchema,
  MATCHING: MatchingContentSchema,
  COLLECTIVE_LIST: CollectiveListContentSchema,
  HOT_BUTTON: HotButtonContentSchema,
};

/**
 * Validiert Content basierend auf dem QuestionType
 */
export function validateQuestionContent(
  type: QuestionType,
  content: unknown
): { success: true; data: QuestionContent } | { success: false; error: z.ZodError } {
  const schema = contentSchemaMap[type];
  if (!schema) {
    return {
      success: false,
      error: new z.ZodError([{
        code: 'custom',
        path: ['type'],
        message: `Unbekannter Fragetyp: ${type}`,
      }]),
    };
  }
  
  const result = schema.safeParse(content);
  if (result.success) {
    return { success: true, data: result.data as QuestionContent };
  }
  return { success: false, error: result.error };
}

/**
 * Type Guard für Multiple Choice
 */
export function isMultipleChoiceContent(content: QuestionContent): content is MultipleChoiceContent {
  return 'correctAnswer' in content && 'incorrectAnswers' in content;
}

/**
 * Type Guard für Estimation
 */
export function isEstimationContent(content: QuestionContent): content is EstimationContent {
  return 'correctValue' in content && 'unit' in content;
}

/**
 * Type Guard für True/False
 */
export function isTrueFalseContent(content: QuestionContent): content is TrueFalseContent {
  return 'correctAnswer' in content && typeof (content as any).correctAnswer === 'boolean';
}

/**
 * Type Guard für Sorting
 */
export function isSortingContent(content: QuestionContent): content is SortingContent {
  return 'items' in content && Array.isArray((content as any).items);
}

/**
 * Type Guard für Text Input
 */
export function isTextInputContent(content: QuestionContent): content is TextInputContent {
  return 'acceptedAnswers' in content;
}

/**
 * Type Guard für Matching
 */
export function isMatchingContent(content: QuestionContent): content is MatchingContent {
  return 'pairs' in content;
}

/**
 * Type Guard für Collective List (Bonusrunde)
 */
export function isCollectiveListContent(content: QuestionContent): content is CollectiveListContent {
  return 'topic' in content && 'items' in content && Array.isArray((content as any).items);
}

/**
 * Type Guard für Hot Button (Bonusrunde)
 */
export function isHotButtonContent(content: QuestionContent): content is HotButtonContent {
  return 'correctAnswer' in content && 'acceptedAnswers' in content && Array.isArray((content as any).acceptedAnswers);
}

// ============================================
// FORM SCHEMAS (für Admin UI)
// ============================================

export const CreateQuestionSchema = z.object({
  categoryId: z.string().min(1, 'Kategorie auswählen'),
  text: z.string().min(10, 'Frage muss mindestens 10 Zeichen haben'),
  type: z.enum(['MULTIPLE_CHOICE', 'ESTIMATION', 'TRUE_FALSE', 'SORTING', 'TEXT_INPUT', 'MATCHING', 'COLLECTIVE_LIST', 'HOT_BUTTON']),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).default('MEDIUM'),
  content: z.unknown(), // Wird separat validiert basierend auf type
  mediaType: z.enum(['NONE', 'IMAGE', 'AUDIO', 'VIDEO']).default('NONE'),
  mediaUrl: z.string().url().optional().or(z.literal('')),
  explanation: z.string().optional(),
  source: z.string().optional(),
});

export const CreateCategorySchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9_]+$/, 'Nur Kleinbuchstaben, Zahlen und Unterstriche'),
  name: z.string().min(2).max(100),
  description: z.string().optional(),
  icon: z.string().min(1).max(10), // Emoji
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Muss ein Hex-Farbcode sein')
    .optional(),
  isActive: z.boolean().default(true),
});

export type CreateQuestionInput = z.infer<typeof CreateQuestionSchema>;
export type CreateCategoryInput = z.infer<typeof CreateCategorySchema>;



