import { RoleplayMemory, RoleplayMemoryKind } from '@prisma/client';

export type RoleplayMemorySnapshot = Pick<
  RoleplayMemory,
  'id' | 'chatId' | 'kind' | 'content' | 'importance' | 'confidence' | 'sourceText' | 'expiresAt' | 'createdAt' | 'updatedAt'
>;

export type ValidatedRoleplayMemoryDraft = {
  kind: RoleplayMemoryKind;
  content: string;
  importance: number;
  confidence: number;
  sourceText: string;
  expiresAt: Date | null;
};
