import { Injectable } from '@nestjs/common';
import { RoleplayState } from '@prisma/client';
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
      `Directive: ${this.createEmotionDirective(input.state)}`,
      `Classifier tone: ${input.analysis.userTone}`,
      `Classifier intent: ${input.analysis.userIntent}`,
      `Classifier directive: ${input.analysis.replyDirective}`,
      'Emotion expression rule: The state above is strictly internal. Never explicitly use the words "mood", "emotion", "affection", "trust", "tension", "energy", or "curiosity" as justifications in the chat.',
      'Express your internal state implicitly through word choice, response length, timing, deflections, or subtle jokes.',
      '',
    ];
  }

  private createEmotionDirective(state: RoleplayState): string {
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
}
