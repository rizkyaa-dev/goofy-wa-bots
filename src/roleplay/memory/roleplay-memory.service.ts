import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RoleplayMemory, RoleplayMemoryKind } from '@prisma/client';
import { AppEnv } from '../../config/env.validation';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { IncomingMessage } from '../../messages/domain/incoming-message';
import { ExtractedRoleplayMemory } from './domain/extracted-roleplay-memory';
import { RoleplayMemoryExtractorService } from './roleplay-memory-extractor.service';
import { RoleplayMemoryTriggerService } from './roleplay-memory-trigger.service';
import { RoleplayMemoryValidatorService } from './roleplay-memory-validator.service';

@Injectable()
export class RoleplayMemoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppEnv, true>,
    private readonly extractor: RoleplayMemoryExtractorService,
    private readonly trigger: RoleplayMemoryTriggerService,
    private readonly validator: RoleplayMemoryValidatorService,
  ) {}

  async retrieve(chatId: string) {
    return this.prisma.roleplayMemory.findMany({
      where: {
        chatId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
      take: this.config.get('ROLEPLAY_MEMORY_LIMIT'),
    });
  }

  async list(chatId: string, limit = 10): Promise<RoleplayMemory[]> {
    return this.prisma.roleplayMemory.findMany({
      where: {
        chatId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
      take: limit,
    });
  }

  async captureFromInbound(message: IncomingMessage, recentContext = ''): Promise<void> {
    const candidates = await this.extractCandidates(message, recentContext);
    const validCandidates = this.validator.validate(
      candidates,
      this.config.get('ROLEPLAY_MEMORY_EXTRACTOR_MIN_CONFIDENCE'),
      this.config.get('ROLEPLAY_MEMORY_EXTRACTOR_MAX_MEMORIES'),
    );

    for (const candidate of validCandidates) {
      await this.upsertMemory(message.chatId, candidate);
    }
  }

  private async extractCandidates(message: IncomingMessage, recentContext: string): Promise<ExtractedRoleplayMemory[]> {
    if (this.config.get('ROLEPLAY_MEMORY_EXTRACTOR_ENABLED') && this.trigger.shouldExtract(message)) {
      try {
        return await this.extractor.extract(message, recentContext);
      } catch {
        return this.extractFallbackCandidates(message.body);
      }
    }

    return this.extractFallbackCandidates(message.body);
  }

  private async upsertMemory(chatId: string, candidate: ExtractedRoleplayMemory): Promise<void> {
    const existing = await this.findSimilarMemory(chatId, candidate);
    const expiresAt = this.resolveExpiresAt(candidate.ttl);

    if (existing) {
      await this.prisma.roleplayMemory.update({
        where: { id: existing.id },
        data: {
          content: candidate.content,
          importance: Math.max(existing.importance, candidate.importance),
          confidence: Math.max(existing.confidence, candidate.confidence),
          sourceText: candidate.sourceText,
          expiresAt,
        },
      });
      return;
    }

    await this.prisma.roleplayMemory.create({
      data: {
        chatId,
        kind: candidate.kind,
        content: candidate.content,
        importance: candidate.importance,
        confidence: candidate.confidence,
        sourceText: candidate.sourceText,
        expiresAt,
      },
    });
  }

  private async findSimilarMemory(chatId: string, candidate: ExtractedRoleplayMemory): Promise<RoleplayMemory | null> {
    const existingMemories = await this.prisma.roleplayMemory.findMany({
      where: {
        chatId,
        kind: candidate.kind,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { updatedAt: 'desc' },
      take: 12,
    });

    return (
      existingMemories.find((memory) => this.calculateSimilarity(memory.content, candidate.content) >= 0.62) ??
      null
    );
  }

  private extractFallbackCandidates(text: string): ExtractedRoleplayMemory[] {
    const normalized = text.trim();
    const lower = normalized.toLowerCase();

    if (normalized.length < 8 || normalized.length > 240) {
      return [];
    }

    if (this.hasNameOrNicknameSignal(lower)) {
      return [this.createFallbackMemory(RoleplayMemoryKind.user_fact, normalized, 85)];
    }

    if (lower.includes('jangan panggil') || lower.includes('jangan bahas')) {
      return [this.createFallbackMemory(RoleplayMemoryKind.boundary, normalized, 85)];
    }

    if (lower.includes('aku suka') || lower.includes('aku nggak suka') || lower.includes('aku gak suka') || lower.includes('aku tidak suka')) {
      return [this.createFallbackMemory(RoleplayMemoryKind.preference, normalized, 75)];
    }

    if (lower.includes('project') || lower.includes('proyek') || lower.includes('aku mau') || lower.includes('aku pengen')) {
      return [this.createFallbackMemory(RoleplayMemoryKind.goal, normalized, 70)];
    }

    if (lower.includes('ingat') || lower.includes('jangan lupa')) {
      return [this.createFallbackMemory(RoleplayMemoryKind.episode, normalized, 70)];
    }

    return [];
  }

  private createFallbackMemory(kind: RoleplayMemoryKind, content: string, importance: number): ExtractedRoleplayMemory {
    return {
      kind,
      content,
      importance,
      confidence: 0.8,
      sourceText: content,
      ttl: kind === RoleplayMemoryKind.episode ? 'short_term' : 'long_term',
    };
  }

  private hasNameOrNicknameSignal(text: string): boolean {
    return (
      text.includes('namaku') ||
      text.includes('nama aku') ||
      text.includes('panggil aku') ||
      /\bnama\s+ku\b/u.test(text) ||
      /\bnama\s+saya\b/u.test(text) ||
      /\bpanggil\s+(aja|saja|saya|aku)\b/u.test(text) ||
      /\bpanggilnya\s+/u.test(text)
    );
  }

  private resolveExpiresAt(ttl: ExtractedRoleplayMemory['ttl']): Date | null {
    if (ttl === 'session') {
      return this.addDays(1);
    }

    if (ttl === 'short_term') {
      return this.addDays(14);
    }

    return null;
  }

  private calculateSimilarity(left: string, right: string): number {
    const leftWords = new Set(this.tokenize(left));
    const rightWords = new Set(this.tokenize(right));

    if (leftWords.size === 0 || rightWords.size === 0) {
      return 0;
    }

    const intersection = Array.from(leftWords).filter((word) => rightWords.has(word)).length;
    const union = new Set([...leftWords, ...rightWords]).size;

    return intersection / union;
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2);
  }

  private addDays(days: number): Date {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
  }
}
