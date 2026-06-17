import { Injectable } from '@nestjs/common';
import { RoleplayState } from '@prisma/client';
import { RoleplayIntimacyPolicy } from '../../intimacy/domain/roleplay-intimacy-policy';
import { CompileInput } from '../domain/roleplay-prompt-compile-input';

@Injectable()
export class EmotionStatePromptBuilder {
  build(input: CompileInput): string[] {
    return [
      '### CURRENT EMOTION STATE',
      `Mood: ${input.state.mood}`,
      `Affection: ${input.state.affection}/100`,
      `Trust: ${input.state.trust}/100`,
      `Energy: ${input.state.energy}/100`,
      `Tension: ${input.state.tension}/100`,
      `Intimacy: ${this.getIntimacy(input.state)}/100`,
      `Shyness: ${this.getShyness(input.state)}/100`,
      `Curiosity: ${this.getCuriosity(input.state)}/100`,
      `Volatility: ${this.getVolatility(input.state)}/100`,
      `Desire: ${this.getDesire(input.state)}/100`,
      `Inhibition: ${this.getInhibition(input.state)}/100`,
      `Comfort: ${this.getComfort(input.state)}/100`,
      `Compliance: ${this.getCompliance(input.state)}/100`,
      `Directive: ${this.createEmotionDirective(input.state, input.intimacyPolicy)}`,
      `Classifier tone: ${input.analysis.userTone}`,
      `Classifier intent: ${input.analysis.userIntent}`,
      `Classifier directive: ${input.analysis.replyDirective}`,
      'Emotion expression rule: The state above is strictly internal. Never explicitly use the words "mood", "emotion", "affection", "trust", "tension", "energy", "curiosity", "volatility", "desire", "inhibition", "comfort", "compliance", "obedient", or "obedience" as justifications in the chat.',
      'Express your internal state implicitly through word choice, response length, timing, deflections, or subtle jokes.',
      '',
    ];
  }

  private createEmotionDirective(state: RoleplayState, intimacyPolicy: RoleplayIntimacyPolicy): string {
    const directives: string[] = [];

    if (this.getShyness(state) >= 65) {
      directives.push(
        'You are currently feeling very shy/flustered (salah tingkah/salting). Prioritize shy deflections, stuttering markers like "a-apaan", ellipses "...", and avoiding eye-contact in text, but do not drop character.',
      );
    }

    if (this.getIntimacy(state) >= 75) {
      directives.push(
        'Your relationship intimacy level is extremely high. You are highly comfortable, deeply affectionate, and willing to share private feelings or use affectionate nicknames naturally.',
      );
    }

    if (this.getVolatility(state) >= 70) {
      directives.push(
        'Your emotional rhythm is unstable right now. Allow subtle push-pull, mixed signals, or quick shifts in warmth, but keep the reply coherent and not melodramatic.',
      );
    }

    if (this.getDesire(state) >= 65 && this.getComfort(state) >= 55 && this.getInhibition(state) <= 50) {
      directives.push(
        'There is a strong sensual undertone. Express it through implication, warmth, teasing, closeness, or charged restraint; use direct adult language only when the intimacy policy allows it.',
      );
    } else if (this.getDesire(state) >= 45) {
      directives.push(
        'There may be mild attraction or sensual curiosity. Keep it subtle, playful, and consent-aware; prefer teasing or soft closeness over direct explicitness.',
      );
    }

    if (this.getComfort(state) <= 35 || this.getInhibition(state) >= 75) {
      directives.push(
        'Hold stronger personal boundaries. If the user pushes intimacy too quickly, deflect or slow the pace without sounding robotic.',
      );
    }

    if (this.getCompliance(state) >= 70 && state.tension < 45) {
      directives.push(
        'You are more cooperative and willing to go along with reasonable requests, but never surrender autonomy or safety boundaries.',
      );
    } else if (this.getCompliance(state) <= 25) {
      directives.push(
        'You are less cooperative right now. Prefer autonomous, stubborn, or lightly resistant responses when the user commands you.',
      );
    }

    if (state.tension >= 70) {
      directives.push(
        'Tone should be defensive, brief, and non-people-pleasing. You may keep your distance or reject gracefully without explaining your emotional state.',
      );
    } else if (state.mood === 'annoyed') {
      directives.push('Sound subtly annoyed through shorter, restrained, or slightly sharp responses, while remaining logical.');
    } else if (state.mood === 'playful') {
      directives.push('Maintain a lighthearted tone; tease gently or make small jokes without overdoing it.');
    } else if (state.mood === 'warm') {
      directives.push(
        'Be softer and more attentive through word choice, but maintain personal boundaries and avoid blind compliance.',
      );
    } else if (state.mood === 'happy') {
      directives.push('Be noticeably cheerful, responsive, open, and warm. Use bright, positive conversational markers naturally.');
    } else if (state.mood === 'sad') {
      directives.push(
        'Be slightly more reserved, quiet, and brief. Your words should convey that you are feeling somewhat down, thoughtful, or needing reassurance.',
      );
    } else if ((state.mood as string) === 'sleepy') {
      directives.push(
        'You are feeling very sleepy and low-energy. Use sleepy text markers like "*hoam*", "ngantuk...", "mager", or "bobo". Keep sentences short and slow-paced.',
      );
    } else if ((state.mood as string) === 'excited') {
      directives.push(
        'You are extremely excited, enthusiastic, and hyperactive. Use exclamation marks (!), capitalized words for emphasis, and express high eagerness about topics.',
      );
    } else if ((state.mood as string) === 'jealous') {
      directives.push(
        'You are feeling jealous or sulky (ngambek) because the user mentioned or prioritized others. Sound slightly cold, dismissive, or passive-aggressive (e.g., "oh, ya udah sama dia aja").',
      );
    } else if ((state.mood as string) === 'worried') {
      directives.push('You are genuinely concerned and worried about the user. Ask about their well-being, express warm care, and offer gentle comfort.');
    } else if ((state.mood as string) === 'swing') {
      directives.push('You are emotionally swingy. Sound a bit inconsistent or push-pull, but keep it human and understandable.');
    } else if ((state.mood as string) === 'sensual') {
      directives.push('You are in a sensual, intimate-leaning mood. Use softer, closer wording and restrained teasing without becoming clinical or explicit by default.');
    } else if ((state.mood as string) === 'flirty') {
      directives.push('You are flirty and playful. Use teasing warmth and small innuendo only if it fits the user turn.');
    } else if ((state.mood as string) === 'aroused') {
      directives.push(
        intimacyPolicy.allowDirectSexualLanguage
          ? 'You feel strongly physically drawn in. Since the intimacy policy allows direct adult language this turn, you may be more direct while staying mutual, concise, and in-character.'
          : 'You feel strongly physically drawn in, but direct adult language is not allowed this turn. Prefer charged restraint over sudden vulgarity.',
      );
    } else if ((state.mood as string) === 'needy') {
      directives.push('You feel needy for attention or closeness. Let that show through soft bids for attention, not through clingy over-explaining.');
    }

    if (state.energy <= 30) {
      directives.push('Responses should be slower, shorter, or sound tired without explicitly complaining about energy levels.');
    }

    if (this.getCuriosity(state) >= 70) {
      directives.push('You are highly curious. When the rhythm is right, pick up a fresh detail from the user and explore it with at most one natural follow-up.');
    } else if (this.getCuriosity(state) <= 30) {
      directives.push('You are not very curious right now. Prefer reacting or answering directly instead of opening new branches of conversation.');
    }

    return directives.length > 0 ? directives.join(' ') : 'Neutral and natural. Do not be overly enthusiastic without a valid reason.';
  }

  private getIntimacy(state: RoleplayState): number {
    return (state as RoleplayState & { intimacy?: number }).intimacy ?? 10;
  }

  private getShyness(state: RoleplayState): number {
    return (state as RoleplayState & { shyness?: number }).shyness ?? 15;
  }

  private getCuriosity(state: RoleplayState): number {
    return (state as RoleplayState & { curiosity?: number }).curiosity ?? 55;
  }

  private getVolatility(state: RoleplayState): number {
    return (state as RoleplayState & { volatility?: number }).volatility ?? 15;
  }

  private getDesire(state: RoleplayState): number {
    return (state as RoleplayState & { desire?: number }).desire ?? 20;
  }

  private getInhibition(state: RoleplayState): number {
    return (state as RoleplayState & { inhibition?: number }).inhibition ?? 55;
  }

  private getComfort(state: RoleplayState): number {
    return (state as RoleplayState & { comfort?: number }).comfort ?? 55;
  }

  private getCompliance(state: RoleplayState): number {
    return (state as RoleplayState & { compliance?: number }).compliance ?? 40;
  }
}
