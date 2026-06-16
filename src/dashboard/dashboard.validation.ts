import { BadRequestException } from '@nestjs/common';
import { BotMode, RoleplayMemoryKind, RoleplayMood } from '@prisma/client';
import { z } from 'zod';

const chatIdSchema = z.string().trim().min(1);
const memoryIdSchema = z.string().trim().min(1);
const importanceSchema = z.number().int().min(0).max(100);
const stateValueSchema = z.number().int().min(0).max(100);

const addContactMemorySchema = z.object({
  kind: z.nativeEnum(RoleplayMemoryKind),
  content: z.string().trim().min(1).max(500),
  importance: importanceSchema,
});

const updateContactModeSchema = z.object({
  mode: z.nativeEnum(BotMode),
});

const updateContactRoleplayStateSchema = z
  .object({
    mood: z.nativeEnum(RoleplayMood).optional(),
    affection: stateValueSchema.optional(),
    trust: stateValueSchema.optional(),
    energy: stateValueSchema.optional(),
    tension: stateValueSchema.optional(),
    intimacy: stateValueSchema.optional(),
    shyness: stateValueSchema.optional(),
    summary: z.string().trim().max(2000).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one state field must be provided.',
  });

export type AddContactMemoryInput = z.infer<typeof addContactMemorySchema>;
export type UpdateContactModeInput = z.infer<typeof updateContactModeSchema>;
export type UpdateContactRoleplayStateInput = z.infer<typeof updateContactRoleplayStateSchema>;

export function parseChatId(chatId: string): string {
  return parseWithSchema(chatIdSchema, chatId, 'chatId');
}

export function parseMemoryId(memoryId: string): string {
  return parseWithSchema(memoryIdSchema, memoryId, 'memoryId');
}

export function parseAddContactMemoryInput(input: unknown): AddContactMemoryInput {
  return parseWithSchema(addContactMemorySchema, input, 'memory payload');
}

export function parseUpdateContactModeInput(input: unknown): UpdateContactModeInput {
  return parseWithSchema(updateContactModeSchema, input, 'mode payload');
}

export function parseUpdateContactRoleplayStateInput(input: unknown): UpdateContactRoleplayStateInput {
  return parseWithSchema(updateContactRoleplayStateSchema, input, 'state payload');
}

function parseWithSchema<T>(schema: z.ZodType<T>, input: unknown, label: string): T {
  const parsed = schema.safeParse(input);

  if (!parsed.success) {
    throw new BadRequestException(`Invalid ${label}: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`);
  }

  return parsed.data;
}
