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

  async retrieve(chatId: string, queryText = ''): Promise<RoleplayMemory[]> {
    const limit = this.config.get('ROLEPLAY_MEMORY_LIMIT');
    const candidateLimit = Math.max(limit * 4, 16);
    const memories = await this.prisma.roleplayMemory.findMany({
      where: {
        chatId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
      take: candidateLimit,
    });

    return this.rankByRelevance(memories, queryText).slice(0, limit);
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
    if (this.isMemoryMetaRequest(message.body)) {
      return [];
    }

    const fallbackCandidates = this.extractFallbackCandidates(message.body);

    if (this.config.get('ROLEPLAY_MEMORY_EXTRACTOR_ENABLED') && this.trigger.shouldExtract(message)) {
      try {
        const extractedCandidates = await this.extractor.extract(message, recentContext);
        return this.mergeCandidates(fallbackCandidates, extractedCandidates);
      } catch {
        return fallbackCandidates;
      }
    }

    return fallbackCandidates;
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
      const identityMemories = this.extractIdentityMemories(normalized);

      if (identityMemories.length > 0) {
        return identityMemories;
      }

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

  private extractIdentityMemories(text: string): ExtractedRoleplayMemory[] {
    const sourceText = text.trim();
    const name = this.extractName(sourceText);
    const nickname = this.extractNickname(sourceText);
    const memories: ExtractedRoleplayMemory[] = [];

    if (name) {
      memories.push(this.createFallbackMemory(RoleplayMemoryKind.user_fact, `Nama pengguna adalah ${name}.`, 95));
    }

    if (nickname && !this.isAffectionateAlias(nickname)) {
      memories.push(this.createFallbackMemory(RoleplayMemoryKind.user_fact, `Pengguna ingin dipanggil ${nickname}.`, 92));
    }

    const affectionateAlias = this.extractAffectionateAlias(sourceText);

    if (affectionateAlias) {
      memories.push(
        this.createFallbackMemory(
          RoleplayMemoryKind.relationship,
          `User mengizinkan karakter memanggilnya ${affectionateAlias} dalam konteks mesra/playful.`,
          90,
        ),
      );
    }

    return memories.map((memory) => ({
      ...memory,
      confidence: 0.95,
      sourceText,
    }));
  }

  private extractName(text: string): string | null {
    const match = /\bnama\s*(?:ku|aku|saya)\s+(.+?)(?=\s+panggil\b|[,.!?;]|$)/iu.exec(text);
    return match ? this.normalizeIdentityValue(match[1]) : null;
  }

  private extractNickname(text: string): string | null {
    const patterns = [
      /\bpanggil\s+(?:aku|saya)\s+(?:aja|saja\s+)?(.+?)(?=\s+(?:tapi|boleh|dan)|[,.!?;]|$)/iu,
      /\bpanggil\s+(?:aja|saja)\s+(.+?)(?=\s+(?:tapi|boleh|dan)|[,.!?;]|$)/iu,
      /\bpanggilnya\s+(.+?)(?=\s+(?:tapi|boleh|dan)|[,.!?;]|$)/iu,
      /\bdipanggil\s+(.+?)(?=\s+(?:tapi|boleh|dan)|[,.!?;]|$)/iu,
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(text);

      if (match) {
        return this.normalizeIdentityValue(match[1]);
      }
    }

    return null;
  }

  private extractAffectionateAlias(text: string): string | null {
    const lower = text.toLowerCase();

    if (!/\b(?:boleh|izin|silakan|panggil|dipanggil)\b.{0,40}\b(?:sayang|syg|ayang|ay)\b/u.test(lower)) {
      return null;
    }

    if (/\bsyg\b/u.test(lower)) {
      return 'syg';
    }

    if (/\bayang\b/u.test(lower)) {
      return 'ayang';
    }

    if (/\bay\b/u.test(lower)) {
      return 'ay';
    }

    return 'sayang';
  }

  private isAffectionateAlias(value: string): boolean {
    return /^(?:sayang|syg|ayang|ay)$/iu.test(value.trim());
  }

  private normalizeIdentityValue(value: string): string | null {
    const normalized = value
      .replace(/["'`]/g, '')
      .replace(/\b(?:ya|dong|nih|sih|deh|aja|saja)\b\s*$/iu, '')
      .trim()
      .split(/\s+/)
      .slice(0, 3)
      .join(' ');

    if (normalized.length < 2 || normalized.length > 40) {
      return null;
    }

    return normalized
      .split(/\s+/)
      .map((word) => (word === word.toLowerCase() ? word.charAt(0).toUpperCase() + word.slice(1) : word))
      .join(' ');
  }

  private mergeCandidates(
    fallbackCandidates: ExtractedRoleplayMemory[],
    extractedCandidates: ExtractedRoleplayMemory[],
  ): ExtractedRoleplayMemory[] {
    if (!fallbackCandidates.some((candidate) => this.isIdentityMemory(candidate))) {
      return [...fallbackCandidates, ...extractedCandidates];
    }

    return [
      ...fallbackCandidates,
      ...extractedCandidates.filter((candidate) => !this.isIdentityMemory(candidate)),
    ];
  }

  private isIdentityMemory(candidate: ExtractedRoleplayMemory): boolean {
    const text = `${candidate.content} ${candidate.sourceText}`.toLowerCase();
    return /\b(nama|panggil|dipanggil|nickname)\b/u.test(text);
  }

  private hasNameOrNicknameSignal(text: string): boolean {
    return (
      text.includes('namaku') ||
      text.includes('nama aku') ||
      text.includes('panggil aku') ||
      text.includes('boleh panggil') ||
      text.includes('boleh dipanggil') ||
      /\bnama\s+ku\b/u.test(text) ||
      /\bnama\s+saya\b/u.test(text) ||
      /\bpanggil\s+(aja|saja|saya|aku)\b/u.test(text) ||
      /\bpanggilnya\s+/u.test(text)
    );
  }

  private isMemoryMetaRequest(text: string): boolean {
    const lower = text.toLowerCase();

    return (
      /\b(?:bukti|mana|kapan|pernah|reply|quote|kutip)\b/u.test(lower) &&
      /\b(?:nama|panggil|memory|memori|ingat)\b/u.test(lower)
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

  private rankByRelevance(memories: RoleplayMemory[], queryText: string): RoleplayMemory[] {
    const queryTokens = new Set(this.tokenize(queryText));

    if (queryTokens.size === 0) {
      return memories;
    }

    return [...memories].sort((left, right) => {
      const leftScore = this.calculateMemoryScore(left, queryTokens);
      const rightScore = this.calculateMemoryScore(right, queryTokens);

      if (leftScore !== rightScore) {
        return rightScore - leftScore;
      }

      if (left.importance !== right.importance) {
        return right.importance - left.importance;
      }

      return right.updatedAt.getTime() - left.updatedAt.getTime();
    });
  }

  private calculateMemoryScore(memory: RoleplayMemory, queryTokens: ReadonlySet<string>): number {
    const memoryTokens = new Set(this.tokenize(`${memory.content} ${memory.sourceText ?? ''}`));
    const overlap = Array.from(queryTokens).filter((token) => memoryTokens.has(token)).length;
    const relevance = queryTokens.size > 0 ? overlap / queryTokens.size : 0;
    const importance = memory.importance / 100;
    const confidence = memory.confidence;

    return relevance * 3 + importance * 0.7 + confidence * 0.3;
  }

  private readonly stopWords = new Set([
    'aku', 'kamu', 'dia', 'saya', 'lu', 'lo', 'gua', 'gue', 'mereka', 'kita', 'kami',
    'yang', 'dan', 'atau', 'tapi', 'ada', 'ini', 'itu', 'lagi', 'dari', 'pada', 'buat',
    'bisa', 'sama', 'oleh', 'ke', 'di', 'dari', 'untuk', 'dengan', 'sih', 'dong', 'deh'
  ]);

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !this.stopWords.has(word));
  }

  private addDays(days: number): Date {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
  }
}
