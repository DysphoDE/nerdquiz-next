/**
 * Zod-Validierung für Socket.io Events
 * 
 * Validiert alle eingehenden Socket-Events für Sicherheit und Typsicherheit.
 */

import { z } from 'zod';
import {
  PLAYER_VALIDATION,
  ROOM_VALIDATION,
  SETTINGS_VALIDATION,
  ANSWER_VALIDATION,
  AVATAR_VALIDATION,
  DEV_MODE_VALIDATION,
} from '@/config/constants';

// ============================================
// COMMON SCHEMAS
// ============================================

/** 4-stelliger Room Code (nur erlaubte Zeichen) */
const RoomCodeSchema = z.string()
    .length(ROOM_VALIDATION.CODE_LENGTH, 'Room-Code muss 4 Zeichen haben')
    .regex(ROOM_VALIDATION.CODE_REGEX, 'Ungültiger Room-Code');

/** Player ID Format */
const PlayerIdSchema = z.string()
    .min(PLAYER_VALIDATION.ID_MIN_LENGTH, 'Player-ID zu kurz')
    .regex(PLAYER_VALIDATION.ID_REGEX, 'Ungültiges Player-ID Format');

/** Player Name */
const PlayerNameSchema = z.string()
    .min(PLAYER_VALIDATION.NAME_MIN_LENGTH, 'Name darf nicht leer sein')
    .max(PLAYER_VALIDATION.NAME_MAX_LENGTH, 'Name zu lang')
    .trim();

// ============================================
// ROOM EVENTS
// ============================================

export const CreateRoomSchema = z.object({
    playerName: PlayerNameSchema,
    avatarOptions: z.string().max(AVATAR_VALIDATION.OPTIONS_MAX_LENGTH).optional(),
});

export const JoinRoomSchema = z.object({
    roomCode: RoomCodeSchema,
    playerName: PlayerNameSchema,
    avatarOptions: z.string().max(AVATAR_VALIDATION.OPTIONS_MAX_LENGTH).optional(),
});

export const ReconnectPlayerSchema = z.object({
    roomCode: RoomCodeSchema,
    playerId: PlayerIdSchema,
});

// ============================================
// GAME SETTINGS
// ============================================

export const UpdateSettingsSchema = z.object({
    roomCode: RoomCodeSchema,
    playerId: PlayerIdSchema,
    settings: z.object({
        maxRounds: z.number().int().min(SETTINGS_VALIDATION.ROUNDS_MIN).max(SETTINGS_VALIDATION.ROUNDS_MAX).optional(),
        questionsPerRound: z.number().int().min(SETTINGS_VALIDATION.QUESTIONS_PER_ROUND_MIN).max(SETTINGS_VALIDATION.QUESTIONS_PER_ROUND_MAX).optional(),
        timePerQuestion: z.number().int().min(SETTINGS_VALIDATION.TIME_PER_QUESTION_MIN).max(SETTINGS_VALIDATION.TIME_PER_QUESTION_MAX).optional(),
        bonusRoundChance: z.number().int().min(SETTINGS_VALIDATION.BONUS_CHANCE_MIN).max(SETTINGS_VALIDATION.BONUS_CHANCE_MAX).optional(),
        finalRoundAlwaysBonus: z.boolean().optional(),
        enableEstimation: z.boolean().optional(),
        enableMediaQuestions: z.boolean().optional(),
        hotButtonQuestionsPerRound: z.number().int().min(SETTINGS_VALIDATION.HOT_BUTTON_QUESTIONS_MIN).max(SETTINGS_VALIDATION.HOT_BUTTON_QUESTIONS_MAX).optional(),
    }),
});

// ============================================
// CATEGORY SELECTION
// ============================================

export const VoteCategorySchema = z.object({
    roomCode: RoomCodeSchema,
    playerId: PlayerIdSchema,
    categoryId: z.string().min(1).max(100), // Category IDs (UUIDs or custom IDs)
});

export const LoserPickCategorySchema = z.object({
    roomCode: RoomCodeSchema,
    playerId: PlayerIdSchema,
    categoryId: z.string().min(1).max(100), // Category IDs (UUIDs or custom IDs)
});

export const DiceRoyaleRollSchema = z.object({
    roomCode: RoomCodeSchema,
    playerId: PlayerIdSchema,
});

export const DiceRoyalePickSchema = z.object({
    roomCode: RoomCodeSchema,
    playerId: PlayerIdSchema,
    categoryId: z.string().min(1).max(100),
});

export const RPSChoiceSchema = z.object({
    roomCode: RoomCodeSchema,
    playerId: PlayerIdSchema,
    choice: z.enum(['rock', 'paper', 'scissors']),
});

export const RPSDuelPickSchema = z.object({
    roomCode: RoomCodeSchema,
    playerId: PlayerIdSchema,
    categoryId: z.string().min(1).max(100),
});

// ============================================
// ANSWERS
// ============================================

export const SubmitAnswerSchema = z.object({
    roomCode: RoomCodeSchema,
    playerId: PlayerIdSchema,
    answerIndex: z.number().int().min(ANSWER_VALIDATION.ANSWER_INDEX_MIN).max(ANSWER_VALIDATION.ANSWER_INDEX_MAX),
});

export const SubmitEstimationSchema = z.object({
    roomCode: RoomCodeSchema,
    playerId: PlayerIdSchema,
    value: z.number().finite(),
});

// ============================================
// BONUS ROUNDS
// ============================================

export const BonusRoundSubmitSchema = z.object({
    roomCode: RoomCodeSchema,
    playerId: PlayerIdSchema,
    answer: z.string().max(ANSWER_VALIDATION.TEXT_ANSWER_MAX_LENGTH),
});

export const BonusRoundSkipSchema = z.object({
    roomCode: RoomCodeSchema,
    playerId: PlayerIdSchema,
});

export const HotButtonBuzzSchema = z.object({
    roomCode: RoomCodeSchema,
    playerId: PlayerIdSchema,
});

export const HotButtonSubmitSchema = z.object({
    roomCode: RoomCodeSchema,
    playerId: PlayerIdSchema,
    answer: z.string().max(ANSWER_VALIDATION.TEXT_ANSWER_MAX_LENGTH),
});

// ============================================
// GAME FLOW
// ============================================

export const StartGameSchema = z.object({
    roomCode: RoomCodeSchema,
    playerId: PlayerIdSchema,
});

export const NextSchema = z.object({
    roomCode: RoomCodeSchema,
    playerId: PlayerIdSchema,
});

export const VoteRematchSchema = z.object({
    roomCode: RoomCodeSchema,
    playerId: PlayerIdSchema,
    vote: z.enum(['yes', 'no']),
});

// ============================================
// AVATAR
// ============================================

export const RerollAvatarSchema = z.object({
    roomCode: RoomCodeSchema,
    playerId: PlayerIdSchema,
});

export const UpdateAvatarSchema = z.object({
    roomCode: RoomCodeSchema,
    playerId: PlayerIdSchema,
    avatarOptions: z.string().max(AVATAR_VALIDATION.OPTIONS_MAX_LENGTH),
});

// ============================================
// DEV COMMANDS
// ============================================

export const EnableDevModeSchema = z.object({
    roomCode: RoomCodeSchema,
    playerId: PlayerIdSchema,
    secretCode: z.string().max(DEV_MODE_VALIDATION.SECRET_CODE_MAX_LENGTH),
});

export const DevCommandSchema = z.object({
    roomCode: RoomCodeSchema,
    playerId: PlayerIdSchema,
    command: z.string().max(DEV_MODE_VALIDATION.COMMAND_MAX_LENGTH),
    params: z.record(z.string(), z.unknown()).optional(),
});

// ============================================
// VALIDATION HELPER
// ============================================

/**
 * Validiert Socket-Event-Daten und gibt typsicheres Ergebnis zurück.
 * Bei Fehler wird null zurückgegeben und ein Warning geloggt.
 */
export function validateSocketEvent<T extends z.ZodSchema>(
    schema: T,
    data: unknown,
    eventName: string
): z.infer<T> | null {
    const result = schema.safeParse(data);
    if (!result.success) {
        console.warn(`⚠️ Invalid ${eventName} event:`, result.error.issues.map(i => i.message).join(', '));
        return null;
    }
    return result.data;
}

// ============================================
// TYPE EXPORTS
// ============================================

export type CreateRoomData = z.infer<typeof CreateRoomSchema>;
export type JoinRoomData = z.infer<typeof JoinRoomSchema>;
export type VoteCategoryData = z.infer<typeof VoteCategorySchema>;
export type SubmitAnswerData = z.infer<typeof SubmitAnswerSchema>;
export type SubmitEstimationData = z.infer<typeof SubmitEstimationSchema>;
export type RPSChoiceData = z.infer<typeof RPSChoiceSchema>;
export type DevCommandData = z.infer<typeof DevCommandSchema>;
