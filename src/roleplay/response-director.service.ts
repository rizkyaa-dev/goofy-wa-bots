import { Injectable } from '@nestjs/common';
import { LlmMessage } from '../llm/domain/llm.types';
import { RoleplayEmotionAnalysis } from './domain/roleplay-emotion-analysis';
import { RoleplayResponsePlan } from './domain/roleplay-response-plan';
import { RoleplayRoute, RoleplayRouteDecision } from './domain/roleplay-route';

type CreatePlanInput = {
  latestUserMessage: string;
  recentMessages: LlmMessage[];
  analysis: RoleplayEmotionAnalysis;
  conversationScope: 'personal_chat' | 'group_chat';
  routeDecision: RoleplayRouteDecision;
  quoteIntent?: string;
};

@Injectable()
export class ResponseDirectorService {
  createPlan(input: CreatePlanInput): RoleplayResponsePlan {
    const recentQuestionCount = this.countRecentAssistantQuestions(input.recentMessages);
    const latestText = input.latestUserMessage.trim();
    const latestIsQuestion = latestText.endsWith('?');
    const latestLooksLikeAnswer = this.looksLikeAnswerToBotQuestion(latestText, input.recentMessages);
    const isNameQuestion = this.isCharacterNameQuestion(latestText);
    const isAmbiguous = this.isAmbiguous(latestText);
    const questionAllowed = this.shouldAllowQuestion({
      analysis: input.analysis,
      recentQuestionCount,
      latestIsQuestion,
      latestLooksLikeAnswer,
      isNameQuestion,
      routeQuestionAllowed: input.routeDecision.questionAllowed,
    });
    const selfDisclosure = this.resolveSelfDisclosure(latestText, latestIsQuestion, latestLooksLikeAnswer, input.routeDecision);

    return {
      route: input.routeDecision.route,
      routeConfidence: input.routeDecision.confidence,
      mode: this.resolveMode({
        analysis: input.analysis,
        route: input.routeDecision.route,
        quoteIntent: input.quoteIntent,
        latestIsQuestion,
        latestLooksLikeAnswer,
        isNameQuestion,
        isAmbiguous,
        questionAllowed,
      }),
      questionAllowed,
      selfDisclosure,
      maxSentences: questionAllowed ? 2 : 1,
      forbiddenTerms: input.conversationScope === 'personal_chat' ? ['pada', 'kalian', 'guys', 'semua'] : [],
      routeReason: input.routeDecision.reason,
      directive: this.createDirective(questionAllowed, latestLooksLikeAnswer, isNameQuestion, isAmbiguous),
    };
  }

  private resolveMode(input: ResolveModeInput): RoleplayResponsePlan['mode'] {
    const routeMode = this.resolveRouteMode(input.route);

    if (routeMode) {
      return routeMode;
    }

    if (input.quoteIntent === 'evidence') {
      return 'quote_evidence';
    }

    if (input.isNameQuestion || input.latestIsQuestion) {
      return 'answer_only';
    }

    if (input.isAmbiguous) {
      return input.questionAllowed ? 'clarify' : 'react_only';
    }

    if (input.analysis.userTone === 'teasing') {
      return 'tease';
    }

    if (input.analysis.userTone === 'pressuring' || input.analysis.userTone === 'annoyed') {
      return 'deflect';
    }

    if (input.latestLooksLikeAnswer || !input.questionAllowed) {
      return 'react_only';
    }

    return 'light_follow_up';
  }

  private shouldAllowQuestion(input: ShouldAllowQuestionInput): boolean {
    if (input.analysis.avoidQuestion || input.recentQuestionCount >= 2 || input.isNameQuestion) {
      return false;
    }

    if (input.latestLooksLikeAnswer && input.recentQuestionCount >= 1) {
      return false;
    }

    if (input.latestIsQuestion) {
      return false;
    }

    return input.routeQuestionAllowed ?? true;
  }

  private resolveSelfDisclosure(
    text: string,
    latestIsQuestion: boolean,
    latestLooksLikeAnswer: boolean,
    routeDecision: RoleplayRouteDecision,
  ): RoleplayResponsePlan['selfDisclosure'] {
    if (this.isCharacterNameQuestion(text) || latestLooksLikeAnswer) {
      return 'none';
    }

    if (routeDecision.selfDisclosure) {
      return routeDecision.selfDisclosure;
    }

    if (latestIsQuestion) {
      return 'small';
    }

    return 'normal';
  }

  private createDirective(questionAllowed: boolean, latestLooksLikeAnswer: boolean, isNameQuestion: boolean, isAmbiguous: boolean): string {
    if (isNameQuestion) {
      return 'Jawab nama karakter langsung. Jangan tambah pertanyaan balik, biodata, atau klaim sudah pernah bilang.';
    }

    if (latestLooksLikeAnswer) {
      return 'User baru menjawab/menanggapi pertanyaan bot. Reaksi dulu, jangan langsung lempar pertanyaan baru.';
    }

    if (isAmbiguous) {
      return questionAllowed
        ? 'Pesan user ambigu. Boleh minta klarifikasi pendek tanpa dua tebakan.'
        : 'Pesan user ambigu, tapi jangan tambah pertanyaan baru; beri reaksi pendek dulu.';
    }

    return questionAllowed
      ? 'Boleh memakai satu follow-up ringan kalau benar-benar natural.'
      : 'Jangan tambah pertanyaan baru. Balas dengan reaksi atau statement pendek.';
  }

  private resolveRouteMode(route: RoleplayRoute): RoleplayResponsePlan['mode'] | null {
    if (route === 'answer_identity') {
      return 'answer_only';
    }

    if (route === 'quote_evidence') {
      return 'quote_evidence';
    }

    if (route === 'ambiguous_clarify') {
      return 'clarify';
    }

    if (route === 'tease_deflect') {
      return 'tease';
    }

    if (route === 'conflict_boundary' || route === 'meta_testing') {
      return 'deflect';
    }

    if (route === 'smalltalk_react' || route === 'emotional_care' || route === 'memory_recall') {
      return 'react_only';
    }

    if (route === 'smalltalk_continue') {
      return 'light_follow_up';
    }

    return null;
  }

  private looksLikeAnswerToBotQuestion(text: string, recentMessages: LlmMessage[]): boolean {
    const latestAssistant = recentMessages
      .filter((message) => message.role === 'assistant')
      .at(-1);

    if (!latestAssistant?.content.trim().endsWith('?')) {
      return false;
    }

    return text.length <= 180;
  }

  private countRecentAssistantQuestions(recentMessages: LlmMessage[]): number {
    return recentMessages
      .filter((message) => message.role === 'assistant')
      .slice(-3)
      .filter((message) => message.content.trim().endsWith('?')).length;
  }

  private isCharacterNameQuestion(text: string): boolean {
    const normalized = text.toLowerCase();
    return /\b(?:nama|namamu|nama\s+kamu|siapa)\b/u.test(normalized) && /\b(?:kamu|mu|bot|alya|namamu|nama)\b/u.test(normalized);
  }

  private isAmbiguous(text: string): boolean {
    return text.length <= 2 || /^[-_.]+$/u.test(text);
  }
}

type ResolveModeInput = {
  analysis: RoleplayEmotionAnalysis;
  route: RoleplayRoute;
  quoteIntent?: string;
  latestIsQuestion: boolean;
  latestLooksLikeAnswer: boolean;
  isNameQuestion: boolean;
  isAmbiguous: boolean;
  questionAllowed: boolean;
};

type ShouldAllowQuestionInput = {
  analysis: RoleplayEmotionAnalysis;
  recentQuestionCount: number;
  latestIsQuestion: boolean;
  latestLooksLikeAnswer: boolean;
  isNameQuestion: boolean;
  routeQuestionAllowed?: boolean;
};
