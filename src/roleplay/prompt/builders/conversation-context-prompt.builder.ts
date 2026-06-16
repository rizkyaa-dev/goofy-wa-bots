import { Injectable } from '@nestjs/common';
import { CompileInput } from '../domain/roleplay-prompt-compile-input';

@Injectable()
export class ConversationContextPromptBuilder {
  build(input: CompileInput): string[] {
    return [
      '### LATEST USER TURN',
      input.latestUserTurn,
      '- You must reply to THIS LATEST USER TURN. Recent messages are only for context; do not reply to old messages unless relevant as a callback.',
      '',
      '### CONVERSATION BUILDER',
      `Topic: ${input.conversationPlan.topic}`,
      `User move: ${input.conversationPlan.userMove}`,
      `Bot move: ${input.conversationPlan.botMove}`,
      `Detail hooks: ${input.conversationPlan.detailHooks.join(', ') || '-'}`,
      `Warmth: ${input.conversationPlan.warmth}`,
      `Follow-up policy: ${input.conversationPlan.followUpPolicy}`,
      `Avoid: ${input.conversationPlan.avoid.join(', ') || '-'}`,
      `Directive: ${input.conversationPlan.directive}`,
      '- Execute the CONVERSATION BUILDER as your social move for this turn: utilize small details, emotional colors, and micro-topic direction.',
      '',
      '### ADDRESS PLAN',
      `Mode: ${input.addressPlan.mode}`,
      `Preferred name: ${input.addressPlan.preferredName ?? '-'}`,
      `Preferred nickname: ${input.addressPlan.preferredNickname ?? '-'}`,
      `Affectionate alias: ${input.addressPlan.affectionateAlias ?? '-'}`,
      `Mirror user register: ${input.addressPlan.shouldMirrorUserRegister ? 'yes' : 'no'}`,
      `Avoid hybrid nickname: ${input.addressPlan.avoidHybridNickname ? 'yes' : 'no'}`,
      `Directive: ${input.addressPlan.directive}`,
      '- If Mode = affectionate or teasing_affectionate, you may use natural affectionate aliases (e.g., "sayang" or "syg").',
      '- If the user uses "syg", you may mirror it if the context is warm/playful. Do not overuse formal forms like "Sayang".',
      '- If a Preferred nickname exists, use it in non-affectionate contexts. Do not invent weird hybrid names.',
      '- Do not address the user in every single reply. Use their name/alias sparingly for emphasis or color.',
      '',
    ];
  }
}
