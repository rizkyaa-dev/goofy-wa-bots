import { Injectable } from '@nestjs/common';
import { LlmMessage } from '../../../llm/domain/llm.types';
import { RoleplayEmotionAnalysis } from '../../domain/roleplay-emotion-analysis';
import { RoleplayResponsePlan } from '../../domain/roleplay-response-plan';
import { CompileInput } from '../domain/roleplay-prompt-compile-input';

@Injectable()
export class ResponseStylePromptBuilder {
  build(input: CompileInput): string[] {
    return [
      '### RESPONSE DIRECTOR',
      `Mode: ${input.responsePlan.mode}`,
      `Route: ${input.responsePlan.route}`,
      `Route confidence: ${input.responsePlan.routeConfidence.toFixed(2)}`,
      `Route reason: ${input.responsePlan.routeReason}`,
      `Reply shape: ${input.responsePlan.replyShape}`,
      `Emotional texture: ${input.responsePlan.emotionalTexture}`,
      `Playfulness: ${input.responsePlan.playfulness}`,
      `Topic development: ${input.responsePlan.topicDevelopment}`,
      `Question allowed: ${input.responsePlan.questionAllowed ? 'yes' : 'no'}`,
      `Self-disclosure: ${input.responsePlan.selfDisclosure}`,
      `Max sentences: ${input.responsePlan.maxSentences}`,
      `Forbidden terms: ${input.responsePlan.forbiddenTerms.join(', ') || '-'}`,
      `Directive: ${input.responsePlan.directive}`,
      '- Follow this RESPONSE DIRECTOR strictly for shaping this turn\'s reply.',
      '',
      '### CONVERSATIONAL PROSODY',
      `Enabled: ${input.prosodyPlan.enabled ? 'yes' : 'no'}`,
      `Max WhatsApp bubbles: ${input.prosodyPlan.maxBubbles}`,
      `Rhythm: ${input.prosodyPlan.rhythm}`,
      `Social beats: ${input.prosodyPlan.socialBeats.join(', ') || '-'}`,
      `Delimiter: ${input.prosodyPlan.delimiter}`,
      `Directive: ${input.prosodyPlan.directive}`,
      '- This is pacing guidance, not a template. Choose bubble count by natural chat rhythm.',
      '- If you use more than one bubble, each bubble must add a distinct social beat and remain sendable on its own.',
      '- Do not force a second bubble when the reply is already complete.',
      `- If using multiple bubbles, separate them with a line containing only ${input.prosodyPlan.delimiter}. The delimiter itself will not be sent.`,
      '- Across all bubbles, obey the question rule and total maximum sentence count from RESPONSE DIRECTOR.',
      '',
      '### TURN STYLE GUIDE',
      ...this.createTurnStyleGuide(input),
      '',
      '### ROUTE EXPERT PROMPT',
      ...input.expertPrompt,
      '- The ROUTE EXPERT PROMPT is a specialized response strategy tailored specifically for this turn.',
      '',
    ];
  }

  private createTurnStyleGuide(input: CompileInput): string[] {
    return [
      this.createReplyShapeDirective(input),
      this.createTextureDirective(input.responsePlan),
      this.createQuestionDirective(input.responsePlan),
      this.createDisclosureDirective(input.responsePlan),
      `Pacing: ${this.createPacingDirective(input.recentMessages, input.analysis)}`,
      `Social pacing: ${this.createSocialPacingDirective(input.recentMessages)}`,
    ].filter((line) => line.trim().length > 0);
  }

  private createReplyShapeDirective(input: CompileInput): string {
    const plan = input.responsePlan;

    if (plan.replyShape === 'answer_texture') {
      return 'Shape: Address the user\'s input first, then add a small stylistic flair. Do not end on a dry, instructional note.';
    }

    if (plan.replyShape === 'react_expand') {
      return 'Shape: Your brief reaction must carry a detail from the user or your character\'s mood, not just a generic "oh/oke/iya".';
    }

    if (plan.replyShape === 'reassure_repair') {
      return 'Shape: Reassure briefly, lightly correct the tone if needed, and conclude. Avoid long apologies or extended flirting.';
    }

    if (plan.replyShape === 'explain_clarify') {
      return 'Shape: Casually clarify your previous statement. A small joke is fine afterward, but do not start with sarcasm or defensiveness (e.g., avoid "ya ... lah", "masa ... doang").';
    }

    if (plan.replyShape === 'comfort_anchor') {
      return 'Shape: Provide brief, grounded validation. Use a specific detail from the user as an anchor rather than giving lengthy advice.';
    }

    if (plan.replyShape === 'tease_deflect') {
      return 'Shape: Playful and short; you may deflect or lightly tease. Do not be overly literal and do not escalate conflicts.';
    }

    if (plan.replyShape === 'boundary') {
      return 'Shape: Short, clear, and establishes a boundary. No need to overly soften the blow.';
    }

    if (plan.replyShape === 'clarify_briefly') {
      return 'Shape: Extremely brief clarification. Do not make multiple guesses.';
    }

    return 'Shape: Answer or react directly, utilizing one small detail if it feels natural.';
  }

  private createTextureDirective(plan: RoleplayResponsePlan): string {
    const parts: string[] = [];

    if (plan.topicDevelopment === 'micro') {
      parts.push('even if you do not ask a question, provide a small contextual comment or callback');
    }

    if (plan.emotionalTexture !== 'none') {
      parts.push('convey emotion through natural chat word choice, not emotional self-reporting');
    }

    if (plan.replyShape !== 'explain_clarify' && (plan.playfulness === 'light' || plan.playfulness === 'medium')) {
      parts.push('allow for slight cheekiness or deflection as long as it remains relevant');
    }

    return parts.length > 0 ? `Texture: ${parts.join('; ')}.` : '';
  }

  private createQuestionDirective(plan: RoleplayResponsePlan): string {
    if (!plan.questionAllowed) {
      return 'Question rule: DO NOT end with a question. Continue the flow via a statement, callback, or minor reaction instead.';
    }

    return 'Question rule: Maximum of ONE light follow-up question, and only if it feels entirely natural.';
  }

  private createDisclosureDirective(plan: RoleplayResponsePlan): string {
    if (plan.selfDisclosure === 'none') {
      return 'Self-disclosure rule: Do not mention the character\'s activities, origin, age, or routines unless explicitly asked.';
    }

    if (plan.selfDisclosure === 'small') {
      return 'Self-disclosure rule: One minor character detail is allowed if it enhances the chat\'s flavor. Do not dump biographical data.';
    }

    return 'Self-disclosure rule: You may share personal details, but keep them concise and relevant to the flow.';
  }

  private createPacingDirective(recentMessages: LlmMessage[], analysis: RoleplayEmotionAnalysis): string {
    const recentAssistantQuestions = recentMessages
      .filter((message) => message.role === 'assistant')
      .slice(-3)
      .filter((message) => message.content.trim().endsWith('?')).length;

    if (analysis.avoidQuestion || recentAssistantQuestions >= 2) {
      return 'Do not introduce new questions. React, deflect, joke lightly, or ride the current emotional wave.';
    }

    if (this.isMetaTestingContext(recentMessages)) {
      return 'The user is discussing bot/project/dev/testing topics. Do not launch into a long denial. Reply briefly in-character, you can act slightly offended or playfully sarcastic, but do not ask interview questions.';
    }

    if (analysis.userTone === 'teasing' || analysis.userTone === 'awkward') {
      return 'Prioritize shy deflections or brief jokes. Do not aggressively tease back or interrogate the user.';
    }

    return 'Vary your approach between reactions, statements, callbacks, and short questions. Avoid sounding like an interviewer.';
  }

  private createSocialPacingDirective(recentMessages: LlmMessage[]): string {
    const recentAssistantMessages = recentMessages.filter((message) => message.role === 'assistant').slice(-3);
    const recentQuestionCount = recentAssistantMessages.filter((message) => message.content.trim().endsWith('?')).length;
    const recentTeaseCount = recentAssistantMessages.filter((message) =>
      /\b(?:wkwk|haha|cie|lah|ih|masa|dasar|ngeles|interview|topiknya|lompat)\b|[😏😌😉]/iu.test(message.content),
    ).length;

    if (recentTeaseCount >= 2) {
      return 'Recent replies have been highly playful/teasing. This next reply must be more direct and warm; do not comment on the user\'s topic patterns unless absolutely necessary.';
    }

    if (recentQuestionCount >= 2) {
      return 'The last two replies were questions. This next reply must be a short reaction/statement with no new questions.';
    }

    if (recentQuestionCount === 1) {
      return 'Your previous reply included a question. Prioritize answering/reacting first; only ask another question if the user clearly demands direction.';
    }

    return 'You may ask a question, but do not interrogate. One light follow-up is sufficient.';
  }

  private isMetaTestingContext(recentMessages: LlmMessage[]): boolean {
    const text = recentMessages
      .slice(-4)
      .map((message) => message.content.toLowerCase())
      .join('\n');

    return ['bot', 'project', 'developer', 'develop', 'testing', 'tes', 'bikin', 'kode'].some((keyword) =>
      text.includes(keyword),
    );
  }
}
