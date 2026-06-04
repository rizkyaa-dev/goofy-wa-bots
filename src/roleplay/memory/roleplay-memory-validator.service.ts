import { Injectable } from '@nestjs/common';
import { RoleplayMemoryKind } from '@prisma/client';
import { ExtractedRoleplayMemory } from './domain/extracted-roleplay-memory';

@Injectable()
export class RoleplayMemoryValidatorService {
  validate(memories: ExtractedRoleplayMemory[], minConfidence: number, maxMemories: number): ExtractedRoleplayMemory[] {
    return memories
      .filter((memory) => this.isValid(memory, minConfidence))
      .map((memory) => ({
        ...memory,
        content: memory.content.trim().slice(0, 180),
        sourceText: memory.sourceText.trim().slice(0, 240),
        importance: this.clamp(memory.importance, 1, 100),
        confidence: Math.min(1, Math.max(0, memory.confidence)),
      }))
      .slice(0, maxMemories);
  }

  private isValid(memory: ExtractedRoleplayMemory, minConfidence: number): boolean {
    return (
      this.isValidKind(memory.kind) &&
      typeof memory.content === 'string' &&
      memory.content.trim().length >= 6 &&
      memory.content.trim().length <= 220 &&
      typeof memory.sourceText === 'string' &&
      memory.sourceText.trim().length > 0 &&
      typeof memory.importance === 'number' &&
      typeof memory.confidence === 'number' &&
      memory.confidence >= minConfidence &&
      this.isValidTtl(memory.ttl)
    );
  }

  private isValidKind(kind: unknown): kind is RoleplayMemoryKind {
    return (
      kind === RoleplayMemoryKind.user_fact ||
      kind === RoleplayMemoryKind.relationship ||
      kind === RoleplayMemoryKind.episode ||
      kind === RoleplayMemoryKind.preference ||
      kind === RoleplayMemoryKind.boundary ||
      kind === RoleplayMemoryKind.goal
    );
  }

  private isValidTtl(ttl: unknown): ttl is ExtractedRoleplayMemory['ttl'] {
    return ttl === 'session' || ttl === 'short_term' || ttl === 'long_term';
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Math.round(value)));
  }
}
