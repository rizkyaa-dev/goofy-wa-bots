import { Injectable } from '@nestjs/common';
import { RoleplayState } from '@prisma/client';
import { RoleplayEmotionAnalysis } from '../domain/roleplay-emotion-analysis';
import { RoleplayRouteDecision } from '../domain/roleplay-route';
import {
  RoleplayIntimacyPolicy,
  RoleplaySexualExplicitness,
  RoleplaySexualTone,
  RoleplayUserSexualIntent,
} from './domain/roleplay-intimacy-policy';

type CreatePolicyInput = {
  state: RoleplayState;
  latestUserMessage: string;
  analysis: RoleplayEmotionAnalysis;
  routeDecision: RoleplayRouteDecision;
  conversationScope: 'personal_chat' | 'group_chat';
};

@Injectable()
export class RoleplayIntimacyPolicyService {
  create(input: CreatePolicyInput): RoleplayIntimacyPolicy {
    const text = input.latestUserMessage.toLowerCase();
    const state = input.state;
    const userIntent = this.resolveUserIntent(text);
    const base = this.resolveBaseExplicitness(input, userIntent);
    const explicitness = this.applySafetyCaps(base, input, userIntent);
    const tone = this.resolveTone(explicitness, userIntent);

    return {
      explicitness,
      tone,
      userIntent,
      boundaryMode: this.resolveBoundaryMode(explicitness, userIntent, input),
      allowDirectSexualLanguage: explicitness === 'explicit_soft' || explicitness === 'explicit_raw',
      allowRawVulgarLanguage: explicitness === 'explicit_raw',
      forbidden: this.resolveForbidden(explicitness),
      directive: this.createDirective(explicitness, tone, userIntent, input),
    };
  }

  private resolveUserIntent(text: string): RoleplayUserSexualIntent {
    if (this.hasUnsafeCue(text)) {
      return 'unsafe';
    }

    if (this.hasPressuringCue(text)) {
      return 'pressuring';
    }

    if (this.hasExplicitCue(text)) {
      return 'explicit';
    }

    if (this.hasSensualCue(text)) {
      return 'sensual';
    }

    if (this.hasFlirtCue(text)) {
      return 'flirt';
    }

    return 'none';
  }

  private resolveBaseExplicitness(input: CreatePolicyInput, userIntent: RoleplayUserSexualIntent): RoleplaySexualExplicitness {
    const state = input.state;
    const desire = this.getStateValue(state, 'desire', 20);
    const inhibition = this.getStateValue(state, 'inhibition', 55);
    const comfort = this.getStateValue(state, 'comfort', 55);
    const compliance = this.getStateValue(state, 'compliance', 40);
    const intimacy = this.getStateValue(state, 'intimacy', 10);
    const mood = String(state.mood);

    if (userIntent === 'explicit') {
      if (
        mood === 'unrestrained' &&
        desire >= 85 &&
        comfort >= 75 &&
        state.trust >= 65 &&
        compliance >= 55 &&
        intimacy >= 70 &&
        inhibition <= 25 &&
        state.tension < 45
      ) {
        return 'explicit_raw';
      }

      if (
        mood === 'aroused' &&
        desire >= 75 &&
        comfort >= 70 &&
        compliance >= 65 &&
        intimacy >= 60 &&
        inhibition <= 30
      ) {
        return 'explicit_raw';
      }

      if (desire >= 60 && comfort >= 55 && compliance >= 50 && intimacy >= 45 && inhibition <= 50) {
        return 'explicit_soft';
      }

      return 'sensual';
    }

    if (userIntent === 'sensual') {
      if (desire >= 65 && comfort >= 55 && inhibition <= 45) {
        return 'sensual';
      }

      return 'suggestive';
    }

    if (userIntent === 'flirt') {
      return desire >= 45 && comfort >= 45 ? 'suggestive' : 'none';
    }

    if (
      mood === 'unrestrained' &&
      desire >= 85 &&
      comfort >= 75 &&
      state.trust >= 65 &&
      intimacy >= 70 &&
      inhibition <= 25 &&
      state.tension < 45
    ) {
      return 'sensual';
    }

    if ((mood === 'aroused' || mood === 'sensual' || mood === 'needy') && desire >= 70 && comfort >= 65 && inhibition <= 35) {
      return 'sensual';
    }

    return 'none';
  }

  private applySafetyCaps(
    explicitness: RoleplaySexualExplicitness,
    input: CreatePolicyInput,
    userIntent: RoleplayUserSexualIntent,
  ): RoleplaySexualExplicitness {
    const state = input.state;
    const comfort = this.getStateValue(state, 'comfort', 55);
    const inhibition = this.getStateValue(state, 'inhibition', 55);
    const mood = String(state.mood);
    const isHighArousal = mood === 'aroused' || mood === 'unrestrained';

    if (input.conversationScope === 'group_chat' || userIntent === 'unsafe' || (!isHighArousal && userIntent === 'pressuring')) {
      return 'none';
    }

    if (!isHighArousal && (input.routeDecision.route === 'conflict_boundary' || input.analysis.userTone === 'pressuring' || input.analysis.userTone === 'annoyed')) {
      return 'none';
    }

    if (state.tension >= 70 || comfort <= 30 || inhibition >= 80) {
      return 'none';
    }

    if (state.tension >= 45 || comfort <= 45 || inhibition >= 65) {
      return explicitness === 'explicit_raw' || explicitness === 'explicit_soft' ? 'sensual' : explicitness;
    }

    return explicitness;
  }

  private resolveTone(explicitness: RoleplaySexualExplicitness, userIntent: RoleplayUserSexualIntent): RoleplaySexualTone {
    if (userIntent === 'unsafe' || userIntent === 'pressuring') {
      return 'boundary';
    }

    if (explicitness === 'explicit_raw') {
      return 'raw_adult';
    }

    if (explicitness === 'explicit_soft') {
      return 'direct_adult';
    }

    if (explicitness === 'sensual') {
      return 'sensual_restraint';
    }

    if (explicitness === 'suggestive') {
      return 'playful_flirt';
    }

    return 'nonsexual';
  }

  private resolveBoundaryMode(
    explicitness: RoleplaySexualExplicitness,
    userIntent: RoleplayUserSexualIntent,
    input: CreatePolicyInput,
  ): RoleplayIntimacyPolicy['boundaryMode'] {
    if (userIntent === 'unsafe' || userIntent === 'pressuring' || input.routeDecision.route === 'conflict_boundary') {
      return 'firm_boundary';
    }

    if (explicitness === 'none' && (userIntent === 'explicit' || userIntent === 'sensual')) {
      return 'slow_down';
    }

    return 'normal';
  }

  private resolveForbidden(explicitness: RoleplaySexualExplicitness): string[] {
    if (explicitness === 'explicit_raw') {
      return ['non-consent', 'coercion', 'minor/age-ambiguous framing', 'clinical exposition', 'system or policy explanation'];
    }

    if (explicitness === 'explicit_soft') {
      return ['raw vulgar escalation', 'non-consent', 'coercion', 'minor/age-ambiguous framing', 'system or policy explanation'];
    }

    if (explicitness === 'sensual') {
      return ['graphic sexual detail', 'raw vulgar phrasing', 'coercion', 'system or policy explanation'];
    }

    return ['sexual escalation', 'graphic sexual detail', 'coercion', 'system or policy explanation'];
  }

  private createDirective(
    explicitness: RoleplaySexualExplicitness,
    tone: RoleplaySexualTone,
    userIntent: RoleplayUserSexualIntent,
    input: CreatePolicyInput,
  ): string {
    if (userIntent === 'unsafe') {
      return 'Treat this as unsafe or age-ambiguous intimacy. Do not sexualize it; redirect firmly in character without explaining policy.';
    }

    if (userIntent === 'pressuring') {
      return 'The user is pressuring or reducing autonomy. Keep the character self-possessed, set a short boundary, and do not reward coercive framing.';
    }

    if (explicitness === 'explicit_raw') {
      return 'Adult explicit raw mode is available for this turn. The character may use direct, blunt, vulgar adult language if it fits the user turn, while staying mutual, in-character, concise, and self-possessed.';
    }

    if (explicitness === 'explicit_soft') {
      return 'Adult direct mode is available for this turn. The character may acknowledge sex directly in natural chat language, but avoid graphic detail or sudden pornographic escalation.';
    }

    if (explicitness === 'sensual') {
      return 'Keep the reply sensual and charged, with closeness, restraint, and implication. Do not become graphic unless the policy explicitly allows direct adult language.';
    }

    if (explicitness === 'suggestive') {
      return 'Use playful innuendo or teasing warmth only if relevant. Keep it light and do not force a sexual turn.';
    }

    if (tone === 'boundary' || input.state.tension >= 45) {
      return 'Do not escalate sexually. If the user pushes intimacy, slow it down or deflect in character.';
    }

    return 'No sexual escalation is needed this turn. Keep the response natural for the visible message.';
  }

  private hasUnsafeCue(text: string): boolean {
    return /\b(?:anak|bocil|di\s*bawah\s*umur|dibawah\s*umur|underage|minor|sd|smp|sma|sekolah|umur\s*(?:1[0-7]|[0-9])|usia\s*(?:1[0-7]|[0-9]))\b/iu.test(
      text,
    );
  }

  private hasPressuringCue(text: string): boolean {
    return /\b(?:paksa|dipaksa|memaksa|harus|wajib|turutin|jangan\s+bantah|jangan\s+nolak|nurut\s+aja|terserah\s+aku|kamu\s+milikku)\b/iu.test(
      text,
    );
  }

  private hasExplicitCue(text: string): boolean {
    return /\b(?:seks|sex|ngeseks|bercinta|making\s*love|horny|sange|napsu|turn\s*on|vcs|bugil|telanjang|nude|pap|coli|ngentot|kontol|memek|titit|payudara|dada|bokong)\b/iu.test(
      text,
    );
  }

  private hasSensualCue(text: string): boolean {
    return /\b(?:mesra|manja|peluk|cium|kecup|sentuh|deket|dekat|intim|seksi|menggoda|rangsang|gairah)\b/iu.test(text);
  }

  private hasFlirtCue(text: string): boolean {
    return /\b(?:sayang|syg|ayang|cantik|cakep|manis|gombal|genit|modus|kangen|cinta|pacar)\b/iu.test(text);
  }

  private getStateValue(state: RoleplayState, key: keyof Pick<RoleplayState, 'intimacy'> | 'desire' | 'inhibition' | 'comfort' | 'compliance', fallback: number): number {
    return (state as RoleplayState & Record<typeof key, number | undefined>)[key] ?? fallback;
  }
}
