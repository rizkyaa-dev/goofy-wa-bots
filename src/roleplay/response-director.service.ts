import { Injectable } from '@nestjs/common';
import { LlmMessage } from '../llm/domain/llm.types';
import { RoleplayBotMove, RoleplayConversationPlan } from './domain/roleplay-conversation-plan';
import { RoleplayEmotionAnalysis } from './domain/roleplay-emotion-analysis';
import { RoleplayResponsePlan } from './domain/roleplay-response-plan';
import { RoleplayRoute, RoleplayRouteDecision } from './domain/roleplay-route';
import { RoleplayIdentityQuestionDetectorService } from './identity/roleplay-identity-question-detector.service';

type CreatePlanInput = {
  latestUserMessage: string;
  recentMessages: LlmMessage[];
  analysis: RoleplayEmotionAnalysis;
  conversationScope: 'personal_chat' | 'group_chat';
  routeDecision: RoleplayRouteDecision;
  conversationPlan: RoleplayConversationPlan;
  quoteIntent?: string;
};

@Injectable()
export class ResponseDirectorService {
  constructor(private readonly identityQuestionDetector: RoleplayIdentityQuestionDetectorService) {}

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
      conversationPlan: input.conversationPlan,
    });
    const selfDisclosure = this.resolveSelfDisclosure(latestText, latestIsQuestion, latestLooksLikeAnswer, input.routeDecision);
    const replyShape = this.resolveReplyShape(input.routeDecision.route, input.conversationPlan.botMove);
    const topicDevelopment = this.resolveTopicDevelopment(input.conversationPlan, questionAllowed, input.routeDecision.route);
    const emotionalTexture = this.resolveEmotionalTexture(input.conversationPlan, input.routeDecision.route);
    const playfulness = this.resolvePlayfulness(input.conversationPlan, input.routeDecision.route, input.recentMessages);

    return {
      route: input.routeDecision.route,
      routeConfidence: input.routeDecision.confidence,
      mode: this.resolveMode({
        analysis: input.analysis,
        route: input.routeDecision.route,
        conversationPlan: input.conversationPlan,
        quoteIntent: input.quoteIntent,
        latestIsQuestion,
        latestLooksLikeAnswer,
        isNameQuestion,
        isAmbiguous,
        questionAllowed,
      }),
      questionAllowed,
      selfDisclosure,
      maxSentences: this.resolveMaxSentences({
        questionAllowed,
        route: input.routeDecision.route,
        replyShape,
        topicDevelopment,
        isAmbiguous,
      }),
      emotionalTexture,
      playfulness,
      topicDevelopment,
      replyShape,
      forbiddenTerms: input.conversationScope === 'personal_chat' ? ['pada', 'kalian', 'guys'] : [],
      routeReason: input.routeDecision.reason,
      directive: this.createDirective({
        questionAllowed,
        latestLooksLikeAnswer,
        isNameQuestion,
        isAmbiguous,
        topicDevelopment,
        replyShape,
      }),
    };
  }

  private resolveMode(input: ResolveModeInput): RoleplayResponsePlan['mode'] {
    const routeMode = this.resolveRouteMode(input.route, input.conversationPlan);

    if (routeMode) {
      return routeMode;
    }

    if (input.quoteIntent === 'evidence') {
      return 'quote_evidence';
    }

    if (input.isNameQuestion || input.latestIsQuestion) {
      return input.conversationPlan.botMove === 'answer_then_warm_texture' ? 'answer_with_texture' : 'answer_only';
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
      return this.shouldExpandReaction(input.conversationPlan) ? 'react_expand' : 'react_only';
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

    if (input.latestIsQuestion && input.conversationPlan.topic === 'user_identity_offer') {
      return true;
    }

    if (input.latestIsQuestion && input.conversationPlan.topic === 'personal_reciprocal_question') {
      return input.recentQuestionCount === 0;
    }

    if (input.latestIsQuestion) {
      return false;
    }

    if (input.conversationPlan.followUpPolicy === 'none') {
      return false;
    }

    if (input.conversationPlan.followUpPolicy === 'one_light_question') {
      return input.routeQuestionAllowed ?? true;
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

  private createDirective(input: CreateDirectiveInput): string {
    if (input.isNameQuestion) {
      return 'Answer the character\'s name directly, then add one fitting stylistic touch. Do not ask a question in return, dump biographical data, or claim you already introduced yourself.';
    }

    if (input.latestLooksLikeAnswer) {
      return input.topicDevelopment === 'micro'
        ? 'The user just answered/responded to your question. React first, then add a brief comment using a detail from the user without throwing a new question.'
        : 'The user just answered/responded to your question. React first, and do not immediately ask a new question.';
    }

    if (input.isAmbiguous) {
      return input.questionAllowed
        ? 'The user\'s message is ambiguous. You may ask for brief clarification without making multiple guesses.'
        : 'The user\'s message is ambiguous, but do not ask a new question; provide a short reaction first.';
    }

    if (input.replyShape === 'answer_texture') {
      return input.questionAllowed
        ? 'Address the user\'s needs first, then add a small stylistic texture. One light follow-up question is allowed only if it feels completely natural.'
        : 'Address the user\'s needs first, then add a small stylistic texture. Do not close with a question.';
    }

    if (input.replyShape === 'comfort_anchor') {
      return 'Provide brief, grounding validation. Use a single detail from the user as an anchor. Do not give lengthy advice or conduct an interview.';
    }

    if (input.replyShape === 'reassure_repair') {
      return 'The user gave a brief apology or expressed concern. Reassure them lightly and humanely. Avoid unnecessary drama, extended flirting, or stiff phrases like "jangan dong maaf".';
    }

    if (input.replyShape === 'explain_clarify') {
      return 'The user asked for clarification on your previous phrase. Casually explain what you meant. Do not open with sarcasm or defensiveness (e.g., "ya ... lah", or "masa ... doang").';
    }

    if (input.replyShape === 'tease_deflect') {
      return 'Reply playfully and briefly with a bit of color. Do not be overly literal, but do not escalate conflicts either.';
    }

    return input.questionAllowed
      ? 'You may include one light follow-up question if it feels completely natural, but always include a reaction or small comment first.'
      : 'Do not add new questions. Reply with a reaction or statement that carries conversational color; avoid dead-end acknowledgments.';
  }

  private resolveRouteMode(route: RoleplayRoute, conversationPlan: RoleplayConversationPlan): RoleplayResponsePlan['mode'] | null {
    if (conversationPlan.botMove === 'complete_previous_fragment') {
      return 'tease';
    }

    if (route === 'answer_identity') {
      return 'answer_with_texture';
    }

    if (route === 'quote_evidence') {
      return 'quote_evidence';
    }

    if (route === 'factual_answer') {
      return 'answer_with_texture';
    }

    if (route === 'ambiguous_clarify') {
      return 'clarify';
    }

    if (route === 'tease_deflect') {
      return 'tease';
    }

    if (route === 'conflict_boundary') {
      return 'deflect';
    }

    if (route === 'meta_testing') {
      return conversationPlan.warmth === 'playful' ? 'tease' : 'deflect';
    }

    if (route === 'emotional_care') {
      return 'react_expand';
    }

    if (route === 'memory_recall') {
      return conversationPlan.botMove === 'answer_then_warm_texture' ? 'answer_with_texture' : 'react_expand';
    }

    if (route === 'smalltalk_react') {
      return this.shouldExpandReaction(conversationPlan) ? 'react_expand' : 'react_only';
    }

    if (route === 'smalltalk_continue') {
      return 'light_follow_up';
    }

    return null;
  }

  private shouldExpandReaction(conversationPlan: RoleplayConversationPlan): boolean {
    return (
      conversationPlan.botMove === 'react_then_continue' ||
      conversationPlan.botMove === 'answer_then_warm_texture' ||
      conversationPlan.botMove === 'comfort_briefly' ||
      conversationPlan.followUpPolicy !== 'none'
    );
  }

  private resolveReplyShape(route: RoleplayRoute, botMove: RoleplayBotMove): RoleplayResponsePlan['replyShape'] {
    if (route === 'conflict_boundary') {
      return 'boundary';
    }

    if (botMove === 'comfort_briefly') {
      return 'comfort_anchor';
    }

    if (botMove === 'reassure_lightly') {
      return 'reassure_repair';
    }

    if (botMove === 'explain_previous_casually') {
      return 'explain_clarify';
    }

    if (botMove === 'complete_previous_fragment') {
      return 'tease_deflect';
    }

    if (botMove === 'tease_lightly') {
      return 'tease_deflect';
    }

    if (botMove === 'playful_affection') {
      return 'tease_deflect';
    }

    if (botMove === 'soft_boundary_affection') {
      return 'tease_deflect';
    }

    if (botMove === 'clarify_briefly') {
      return 'clarify_briefly';
    }

    if (botMove === 'answer_then_warm_texture') {
      return 'answer_texture';
    }

    if (botMove === 'react_then_continue') {
      return 'react_expand';
    }

    return 'answer_react';
  }

  private resolveTopicDevelopment(
    conversationPlan: RoleplayConversationPlan,
    questionAllowed: boolean,
    route: RoleplayRoute,
  ): RoleplayResponsePlan['topicDevelopment'] {
    if (route === 'conflict_boundary' || conversationPlan.followUpPolicy === 'none') {
      return conversationPlan.botMove === 'answer_then_warm_texture' ||
        conversationPlan.botMove === 'tease_lightly' ||
        conversationPlan.botMove === 'playful_affection' ||
        conversationPlan.botMove === 'soft_boundary_affection' ||
        conversationPlan.botMove === 'reassure_lightly' ||
        conversationPlan.botMove === 'explain_previous_casually'
        ? 'micro'
        : 'none';
    }

    if (questionAllowed && conversationPlan.followUpPolicy === 'one_light_question') {
      return 'follow_up';
    }

    return 'micro';
  }

  private resolveEmotionalTexture(
    conversationPlan: RoleplayConversationPlan,
    route: RoleplayRoute,
  ): RoleplayResponsePlan['emotionalTexture'] {
    if (route === 'conflict_boundary' || conversationPlan.warmth === 'low') {
      return 'none';
    }

    if (
      conversationPlan.warmth === 'tender' ||
      conversationPlan.botMove === 'comfort_briefly' ||
      conversationPlan.botMove === 'reassure_lightly' ||
      conversationPlan.botMove === 'explain_previous_casually' ||
      conversationPlan.botMove === 'complete_previous_fragment' ||
      conversationPlan.botMove === 'playful_affection' ||
      conversationPlan.botMove === 'soft_boundary_affection'
    ) {
      return 'medium';
    }

    return 'small';
  }

  private resolvePlayfulness(
    conversationPlan: RoleplayConversationPlan,
    route: RoleplayRoute,
    recentMessages: LlmMessage[],
  ): RoleplayResponsePlan['playfulness'] {
    if (route === 'conflict_boundary') {
      return 'none';
    }

    if (conversationPlan.botMove === 'explain_previous_casually') {
      return 'light';
    }

    if (conversationPlan.botMove === 'complete_previous_fragment') {
      return 'medium';
    }

    if (this.countRecentPlayfulAssistantReplies(recentMessages) >= 2 && route !== 'tease_deflect') {
      return 'light';
    }

    if (conversationPlan.warmth === 'playful' || conversationPlan.botMove === 'tease_lightly') {
      return 'medium';
    }

    if (conversationPlan.botMove === 'playful_affection' || conversationPlan.botMove === 'soft_boundary_affection') {
      return 'medium';
    }

    return 'light';
  }

  private countRecentPlayfulAssistantReplies(recentMessages: LlmMessage[]): number {
    return recentMessages
      .filter((message) => message.role === 'assistant')
      .slice(-3)
      .filter((message) => /\b(?:wkwk|haha|cie|lah|ih|masa|dasar|yaudah|ngeles)\b|[😏😌😉]/iu.test(message.content))
      .length;
  }

  private resolveMaxSentences(input: ResolveMaxSentencesInput): number {
    if (input.route === 'conflict_boundary' || input.isAmbiguous) {
      return 1;
    }

    if (
      input.replyShape === 'comfort_anchor' ||
      input.replyShape === 'reassure_repair' ||
      input.replyShape === 'explain_clarify' ||
      input.replyShape === 'answer_texture' ||
      input.replyShape === 'react_expand'
    ) {
      return input.topicDevelopment === 'follow_up' || input.questionAllowed ? 3 : 2;
    }

    if (input.replyShape === 'tease_deflect') {
      return 2;
    }

    return input.questionAllowed ? 2 : 1;
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
    return this.identityQuestionDetector.isCharacterNameQuestion(text);
  }

  private isAmbiguous(text: string): boolean {
    return text.length <= 2 || /^[-_.]+$/u.test(text);
  }
}

type ResolveModeInput = {
  analysis: RoleplayEmotionAnalysis;
  route: RoleplayRoute;
  conversationPlan: RoleplayConversationPlan;
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
  conversationPlan: RoleplayConversationPlan;
};

type CreateDirectiveInput = {
  questionAllowed: boolean;
  latestLooksLikeAnswer: boolean;
  isNameQuestion: boolean;
  isAmbiguous: boolean;
  topicDevelopment: RoleplayResponsePlan['topicDevelopment'];
  replyShape: RoleplayResponsePlan['replyShape'];
};

type ResolveMaxSentencesInput = {
  questionAllowed: boolean;
  route: RoleplayRoute;
  replyShape: RoleplayResponsePlan['replyShape'];
  topicDevelopment: RoleplayResponsePlan['topicDevelopment'];
  isAmbiguous: boolean;
};
