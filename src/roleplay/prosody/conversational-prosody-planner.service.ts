import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppEnv } from '../../config/env.validation';
import { LlmMessage } from '../../llm/domain/llm.types';
import { RoleplayConversationPlan } from '../domain/roleplay-conversation-plan';
import { RoleplayEmotionAnalysis } from '../domain/roleplay-emotion-analysis';
import { RoleplayProsodyPlan, RoleplayProsodyRhythm } from '../domain/roleplay-prosody-plan';
import { RoleplayResponsePlan } from '../domain/roleplay-response-plan';

type CreateInput = {
  latestUserMessage: string;
  recentMessages: LlmMessage[];
  analysis: RoleplayEmotionAnalysis;
  conversationPlan: RoleplayConversationPlan;
  responsePlan: RoleplayResponsePlan;
  quoteAction: string;
};

@Injectable()
export class ConversationalProsodyPlannerService {
  private readonly delimiter = '<<<NEXT>>>';

  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  create(input: CreateInput): RoleplayProsodyPlan {
    const enabled = this.config.get('ROLEPLAY_MULTI_BUBBLE_ENABLED');
    const hardMaxBubbles = this.config.get('ROLEPLAY_MULTI_BUBBLE_MAX_PARTS');
    const maxBubbles = enabled ? Math.min(hardMaxBubbles, this.resolveMaxBubbles(input)) : 1;
    const rhythm = this.resolveRhythm(input, maxBubbles);
    const socialBeats = this.resolveSocialBeats(input);

    return {
      enabled: enabled && maxBubbles > 1,
      maxBubbles,
      rhythm,
      socialBeats,
      delimiter: this.delimiter,
      interBubbleDelayMs: this.resolveInterBubbleDelayMs(rhythm),
      allowSentenceFallbackSplit: maxBubbles > 1,
      directive: this.createDirective(maxBubbles, rhythm),
    };
  }

  private resolveMaxBubbles(input: CreateInput): number {
    if (this.mustStaySingleBubble(input)) {
      return 1;
    }

    if (this.recentAssistantWasBusy(input.recentMessages)) {
      return 1;
    }

    if (input.analysis.userTone === 'vulnerable' || input.responsePlan.replyShape === 'comfort_anchor') {
      return 2;
    }

    if (input.responsePlan.playfulness === 'medium' && input.conversationPlan.warmth === 'playful') {
      return 3;
    }

    if (
      input.responsePlan.questionAllowed &&
      input.responsePlan.topicDevelopment !== 'none' &&
      (input.responsePlan.selfDisclosure !== 'none' || input.responsePlan.emotionalTexture !== 'none')
    ) {
      return 3;
    }

    if (input.responsePlan.topicDevelopment !== 'none' || input.responsePlan.questionAllowed) {
      return 2;
    }

    return 1;
  }

  private mustStaySingleBubble(input: CreateInput): boolean {
    return (
      input.quoteAction === 'quote_reply' ||
      input.responsePlan.route === 'conflict_boundary' ||
      input.responsePlan.route === 'quote_evidence' ||
      input.responsePlan.route === 'factual_answer' ||
      input.responsePlan.mode === 'deflect' ||
      input.responsePlan.mode === 'quote_evidence' ||
      input.responsePlan.replyShape === 'boundary' ||
      input.responsePlan.replyShape === 'clarify_briefly' ||
      input.latestUserMessage.trim().length <= 2
    );
  }

  private recentAssistantWasBusy(recentMessages: LlmMessage[]): boolean {
    const recentAssistant = recentMessages.filter((message) => message.role === 'assistant').slice(-2);
    const busyReplies = recentAssistant.filter((message) => this.isBusyAssistantReply(message.content)).length;

    return busyReplies >= 2 || this.isVeryBusyAssistantReply(recentAssistant.at(-1)?.content ?? '');
  }

  private countMessageChunks(text: string): number {
    return text
      .split(/\n+/u)
      .map((part) => part.trim())
      .filter(Boolean).length;
  }

  private isBusyAssistantReply(text: string): boolean {
    return this.countMessageChunks(text) >= 2;
  }

  private isVeryBusyAssistantReply(text: string): boolean {
    const chunks = this.countMessageChunks(text);
    const normalizedLength = text.replace(/\s+/g, ' ').trim().length;

    return chunks >= 3 || (chunks >= 2 && normalizedLength >= 180);
  }

  private resolveRhythm(input: CreateInput, maxBubbles: number): RoleplayProsodyRhythm {
    if (maxBubbles <= 1) {
      return input.responsePlan.mode === 'react_only' ? 'low_energy' : 'single_direct';
    }

    if (
      input.analysis.userTone === 'vulnerable' ||
      input.responsePlan.replyShape === 'comfort_anchor' ||
      input.responsePlan.emotionalTexture === 'medium'
    ) {
      return 'warm_layered';
    }

    if (input.responsePlan.playfulness === 'medium') {
      return 'playful_stutter';
    }

    return 'soft_pingpong';
  }

  private resolveSocialBeats(input: CreateInput): string[] {
    const beats = new Set<string>();

    beats.add(input.responsePlan.mode.startsWith('answer') ? 'answer_or_address_latest_turn' : 'react_to_latest_turn');

    if (input.responsePlan.emotionalTexture !== 'none') {
      beats.add('add_small_emotional_color');
    }

    if (input.responsePlan.selfDisclosure !== 'none') {
      beats.add('tiny_self_disclosure_if_natural');
    }

    if (input.responsePlan.playfulness !== 'none') {
      beats.add('micro_tease_or_callback_if_natural');
    }

    if (input.responsePlan.questionAllowed) {
      beats.add('return_attention_with_at_most_one_light_question');
    }

    return Array.from(beats);
  }

  private resolveInterBubbleDelayMs(rhythm: RoleplayProsodyRhythm): number {
    if (rhythm === 'playful_stutter') {
      return 550;
    }

    if (rhythm === 'warm_layered') {
      return 850;
    }

    return 650;
  }

  private createDirective(maxBubbles: number, rhythm: RoleplayProsodyRhythm): string {
    if (maxBubbles <= 1) {
      return 'Use one WhatsApp bubble. Keep the turn compact and direct.';
    }

    return [
      `You may choose 1-${maxBubbles} WhatsApp bubbles based on natural chat rhythm.`,
      `Rhythm hint: ${rhythm}.`,
      'Use multiple bubbles only when each bubble adds a separate social beat.',
      'Prefer one bubble when unsure; never split just to look natural.',
    ].join(' ');
  }
}
