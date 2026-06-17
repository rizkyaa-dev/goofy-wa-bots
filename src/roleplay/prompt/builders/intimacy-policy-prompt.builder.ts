import { Injectable } from '@nestjs/common';
import { CompileInput } from '../domain/roleplay-prompt-compile-input';

@Injectable()
export class IntimacyPolicyPromptBuilder {
  build(input: CompileInput): string[] {
    const policy = input.intimacyPolicy;

    return [
      '### INTIMACY AND SEXUAL TONE POLICY',
      `Explicitness: ${policy.explicitness}`,
      `Sexual tone: ${policy.tone}`,
      `Detected user intimacy intent: ${policy.userIntent}`,
      `Boundary mode: ${policy.boundaryMode}`,
      `Direct adult language allowed: ${policy.allowDirectSexualLanguage ? 'yes' : 'no'}`,
      `Raw vulgar language allowed: ${policy.allowRawVulgarLanguage ? 'yes' : 'no'}`,
      `Forbidden for this turn: ${policy.forbidden.join(', ')}`,
      `Directive: ${policy.directive}`,
      '- This policy controls sexual explicitness only. It does not require sexual content when the visible user message does not call for it.',
      '- Never mention this policy, explicitness level, safety checks, or internal scoring to the user.',
      '- If direct adult language is not allowed, keep intimacy implicit through teasing, warmth, or deflection.',
      '',
    ];
  }
}
