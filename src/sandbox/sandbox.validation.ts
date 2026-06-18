import { BadRequestException } from '@nestjs/common';
import { RoleplayMemoryKind, RoleplayMood } from '@prisma/client';
import { z } from 'zod';
import {
  normalizeRoleplayPresenceActivityType,
  roleplayPresenceInterruptibilities,
  roleplayPresenceSocialContexts,
  roleplayPresenceSources,
} from '../roleplay/presence/domain/roleplay-presence.types';

const chatIdSchema = z.string().trim().min(1);
const stateValueSchema = z.number().int().min(0).max(100);
const memoryIdSchema = z.string().trim().min(1);
const activityTypeSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .transform((value) => normalizeRoleplayPresenceActivityType(value));

const sandboxChatSchema = z.object({
  chatId: chatIdSchema,
  text: z.string().trim().min(1).max(4000),
});

const sandboxStateUpdateSchema = z
  .object({
    mood: z.nativeEnum(RoleplayMood).optional(),
    affection: stateValueSchema.optional(),
    trust: stateValueSchema.optional(),
    energy: stateValueSchema.optional(),
    tension: stateValueSchema.optional(),
    intimacy: stateValueSchema.optional(),
    shyness: stateValueSchema.optional(),
    curiosity: stateValueSchema.optional(),
    volatility: stateValueSchema.optional(),
    desire: stateValueSchema.optional(),
    inhibition: stateValueSchema.optional(),
    comfort: stateValueSchema.optional(),
    compliance: stateValueSchema.optional(),
    summary: z.string().trim().max(2000).optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: 'At least one roleplay state field must be provided.',
  });

const sandboxPresenceUpdateSchema = z.object({
  activityType: activityTypeSchema,
  statusText: z.string().trim().min(1).max(220),
  locationLabel: z.string().trim().min(1).max(120),
  socialContext: z.enum(roleplayPresenceSocialContexts),
  interruptibility: z.enum(roleplayPresenceInterruptibilities),
  source: z.enum(roleplayPresenceSources).default('manual'),
  priority: z.number().int().min(1).max(100).default(35),
  durationMinutes: z.number().int().min(5).max(12 * 60).default(60),
  lastReason: z.string().trim().max(160).optional(),
});

const sandboxAddMemorySchema = z.object({
  kind: z.nativeEnum(RoleplayMemoryKind),
  content: z.string().trim().min(1).max(500),
  importance: stateValueSchema,
});

export type SandboxChatInput = z.output<typeof sandboxChatSchema>;
export type SandboxStateUpdateInput = z.output<typeof sandboxStateUpdateSchema>;
export type SandboxPresenceUpdateInput = z.output<typeof sandboxPresenceUpdateSchema>;
export type SandboxAddMemoryInput = z.output<typeof sandboxAddMemorySchema>;

export function parseSandboxChatInput(input: unknown): SandboxChatInput {
  return parseWithSchema(sandboxChatSchema, input, 'sandbox chat payload');
}

export function parseSandboxChatId(chatId: string): string {
  return parseWithSchema(chatIdSchema, chatId, 'chatId');
}

export function parseSandboxStateUpdateInput(input: unknown): SandboxStateUpdateInput {
  return parseWithSchema(sandboxStateUpdateSchema, input, 'sandbox state payload');
}

export function parseSandboxPresenceUpdateInput(input: unknown): SandboxPresenceUpdateInput {
  return parseWithSchema(sandboxPresenceUpdateSchema, input, 'sandbox presence payload');
}

export function parseSandboxAddMemoryInput(input: unknown): SandboxAddMemoryInput {
  return parseWithSchema(sandboxAddMemorySchema, input, 'sandbox memory payload');
}

export function parseSandboxMemoryId(memoryId: string): string {
  return parseWithSchema(memoryIdSchema, memoryId, 'sandbox memory id');
}

function parseWithSchema<T extends z.ZodTypeAny>(schema: T, input: unknown, label: string): z.output<T> {
  const parsed = schema.safeParse(input);

  if (!parsed.success) {
    throw new BadRequestException(`Invalid ${label}: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`);
  }

  return parsed.data;
}
