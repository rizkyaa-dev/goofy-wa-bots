import { RoleplayMemoryKind } from '@prisma/client';

export type ExtractedRoleplayMemory = {
  kind: RoleplayMemoryKind;
  content: string;
  importance: number;
  confidence: number;
  sourceText: string;
  ttl: 'session' | 'short_term' | 'long_term';
};
