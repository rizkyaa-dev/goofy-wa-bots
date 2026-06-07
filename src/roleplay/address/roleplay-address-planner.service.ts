import { Injectable } from '@nestjs/common';
import { RoleplayMemory } from '@prisma/client';
import { LlmMessage } from '../../llm/domain/llm.types';
import { RoleplayAddressPlan } from '../domain/roleplay-address-plan';
import { RoleplayConversationPlan } from '../domain/roleplay-conversation-plan';
import { RoleplayRouteDecision } from '../domain/roleplay-route';

type CreateAddressPlanInput = {
  latestUserMessage: string;
  recentMessages: LlmMessage[];
  memories: RoleplayMemory[];
  routeDecision: RoleplayRouteDecision;
  conversationPlan: RoleplayConversationPlan;
};

@Injectable()
export class RoleplayAddressPlannerService {
  create(input: CreateAddressPlanInput): RoleplayAddressPlan {
    const latestText = input.latestUserMessage.trim();
    const recentText = this.formatRecentText(input.recentMessages);
    const memoryText = input.memories.map((memory) => `${memory.content} ${memory.sourceText ?? ''}`).join('\n');
    const sourceText = `${latestText}\n${recentText}\n${memoryText}`;
    const preferredName = this.extractPreferredName(sourceText);
    const preferredNickname = this.extractPreferredNickname(sourceText, preferredName);
    const affectionateAlias = this.resolveAffectionateAlias(latestText, recentText, memoryText);
    const asksToBeCalled = this.asksToBeCalled(latestText);
    const intimacyContext = this.isIntimacyContext(latestText, input.conversationPlan, input.routeDecision);
    const shouldMirrorUserRegister = this.shouldMirrorRegister(latestText, recentText);

    if (affectionateAlias && (asksToBeCalled || intimacyContext)) {
      return this.createPlan({
        mode: intimacyContext ? 'teasing_affectionate' : 'affectionate',
        preferredName,
        preferredNickname,
        affectionateAlias: shouldMirrorUserRegister ? this.mirrorAffectionateAlias(latestText, affectionateAlias) : affectionateAlias,
        shouldMirrorUserRegister,
        directive:
          'Konteksnya panggilan mesra/playful. Boleh panggil user dengan alias mesra yang diizinkan, tapi jangan dipakai di setiap kalimat.',
      });
    }

    if (preferredNickname) {
      return this.createPlan({
        mode: 'nickname',
        preferredName,
        preferredNickname,
        affectionateAlias,
        shouldMirrorUserRegister,
        directive:
          'Gunakan nickname pilihan user saat perlu menyapa. Jangan membuat gabungan nama sendiri atau hybrid nickname.',
      });
    }

    return this.createPlan({
      mode: 'none',
      preferredName,
      preferredNickname,
      affectionateAlias,
      shouldMirrorUserRegister,
      directive: 'Tidak perlu menyapa user dengan nama/panggilan kecuali natural.',
    });
  }

  private createPlan(plan: Omit<RoleplayAddressPlan, 'avoidHybridNickname'>): RoleplayAddressPlan {
    return {
      ...plan,
      avoidHybridNickname: true,
    };
  }

  private extractPreferredName(text: string): string | undefined {
    const patterns = [
      /\bnama\s+(?:pengguna|user)\s+(?:adalah|:)?\s*([A-Za-zÀ-ÿ][\p{L}\s'-]{1,32})/iu,
      /\bnama\s*(?:ku|aku|saya)\s+([A-Za-zÀ-ÿ][\p{L}\s'-]{1,32})(?=\s+(?:dipanggil|panggil|tapi|boleh)|[,.!?;]|$)/iu,
    ];

    return this.firstIdentityMatch(text, patterns);
  }

  private extractPreferredNickname(text: string, preferredName?: string): string | undefined {
    const patterns = [
      /\bpengguna\s+ingin\s+dipanggil\s+([A-Za-zÀ-ÿ][\p{L}\s'-]{1,24})/iu,
      /\bdipanggil\s+([A-Za-zÀ-ÿ][\p{L}\s'-]{1,24})(?=\s+(?:tapi|boleh|dan)|[,.!?;]|$)/iu,
      /\bpanggil\s+(?:aku|saya)\s+(?:aja|saja\s+)?([A-Za-zÀ-ÿ][\p{L}\s'-]{1,24})(?=[,.!?;]|$)/iu,
    ];
    const nickname = this.firstIdentityMatch(text, patterns);

    if (!nickname || this.isAffectionateAlias(nickname)) {
      return undefined;
    }

    if (preferredName && nickname.toLowerCase() === preferredName.toLowerCase()) {
      return undefined;
    }

    return nickname;
  }

  private resolveAffectionateAlias(latestText: string, recentText: string, memoryText: string): string | undefined {
    const latestAlias = this.extractAffectionateAlias(latestText);

    if (latestAlias) {
      return latestAlias;
    }

    const memoryAlias = this.extractAffectionateAlias(memoryText);

    if (memoryAlias) {
      return memoryAlias;
    }

    return this.extractAffectionateAlias(recentText);
  }

  private extractAffectionateAlias(text: string): string | undefined {
    const lower = text.toLowerCase();

    if (/\b(?:syg|sayang|ayang|ay)\b/u.test(lower)) {
      return /\bsyg\b/u.test(lower) ? 'syg' : 'sayang';
    }

    return undefined;
  }

  private firstIdentityMatch(text: string, patterns: RegExp[]): string | undefined {
    for (const pattern of patterns) {
      const match = pattern.exec(text);

      if (!match?.[1]) {
        continue;
      }

      const value = this.normalizeIdentity(match[1]);

      if (value) {
        return value;
      }
    }

    return undefined;
  }

  private normalizeIdentity(value: string): string | undefined {
    const normalized = value
      .replace(/["'`]/g, '')
      .replace(/\b(?:ya|dong|nih|sih|deh|aja|saja|boleh|tapi|dan)\b.*$/iu, '')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .join(' ');

    if (normalized.length < 2 || normalized.length > 24) {
      return undefined;
    }

    return normalized
      .split(/\s+/)
      .map((word) => (word === word.toLowerCase() ? word.charAt(0).toUpperCase() + word.slice(1) : word))
      .join(' ');
  }

  private asksToBeCalled(text: string): boolean {
    return /\b(?:panggil|dipanggil|manggil|sebut)\b/iu.test(text);
  }

  private isIntimacyContext(
    text: string,
    conversationPlan: RoleplayConversationPlan,
    routeDecision: RoleplayRouteDecision,
  ): boolean {
    const lower = text.toLowerCase();

    return (
      conversationPlan.topic === 'affectionate_flirt' ||
      conversationPlan.topic === 'intimacy_request' ||
      routeDecision.route === 'tease_deflect' ||
      /\b(?:sayang|syg|ayang|mesra|bermesraan|cakep|cantik|cewe cakep|gombal)\b/u.test(lower)
    );
  }

  private shouldMirrorRegister(latestText: string, recentText: string): boolean {
    return /\b(?:syg|iyah|chattingan|chaingan|wkwk|haha)\b/iu.test(`${latestText}\n${recentText}`);
  }

  private mirrorAffectionateAlias(latestText: string, fallback: string): string {
    return /\bsyg\b/iu.test(latestText) ? 'syg' : fallback;
  }

  private isAffectionateAlias(value: string): boolean {
    return /^(?:sayang|syg|ayang|ay)$/iu.test(value.trim());
  }

  private formatRecentText(messages: LlmMessage[]): string {
    return messages
      .slice(-8)
      .map((message) => message.content)
      .join('\n');
  }
}
