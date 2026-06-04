import { Injectable } from '@nestjs/common';
import { RoleplayMood, RoleplayState } from '@prisma/client';
import { IncomingMessage } from '../messages/domain/incoming-message';

@Injectable()
export class EmotionEngineService {
  evaluateInbound(state: RoleplayState, message: IncomingMessage) {
    const text = message.body.toLowerCase();
    const positive = this.matches(text, ['makasih', 'terima kasih', 'thanks', 'wkwk', 'haha', 'hehe', 'sayang', 'kangen']);
    const negative = this.matches(text, ['bodoh', 'benci', 'diam', 'goblok', 'anjing', 'bangsat', 'kesal']);
    const apology = this.matches(text, ['maaf', 'sorry']);
    const question = text.includes('?') || this.matches(text, ['gimana', 'kenapa', 'apa', 'siapa', 'kapan']);
    const pressure = this.matches(text, ['harus', 'cepet', 'sekarang juga', 'pokoknya', 'wajib', 'turutin', 'jangan bantah']);
    const boundaryCrossing = this.matches(text, ['jangan banyak alasan', 'kamu milikku', 'nurut aja', 'terserah aku']);
    const vulnerable = this.matches(text, ['capek', 'sedih', 'takut', 'sendiri', 'bingung', 'pusing', 'lelah']);
    const metaTesting = this.matches(text, ['bot', 'project', 'developer', 'develop', 'testing', 'tes', 'bikin', 'kode']);
    const teasing = this.matches(text, ['genit', 'modus', 'gombal', 'bawel', 'sok', 'yaelah', 'ye']);
    const shortMessage = text.trim().length <= 8;
    const longGap = state.lastInteractionAt ? Date.now() - state.lastInteractionAt.getTime() > 12 * 60 * 60 * 1000 : false;

    const affection = this.clamp(
      state.affection +
        (positive ? 2 : 0) +
        (vulnerable ? 1 : 0) +
        (negative ? -3 : 0) +
        (pressure ? -1 : 0) +
        (teasing ? 1 : 0) +
        (apology ? 1 : 0),
    );
    const trust = this.clamp(state.trust + (apology ? 2 : 0) + (vulnerable ? 1 : 0) + (negative ? -2 : 0) + (boundaryCrossing ? -4 : 0));
    const tension = this.clamp(
      state.tension +
        (negative ? 8 : 0) +
        (pressure ? 5 : 0) +
        (boundaryCrossing ? 10 : 0) +
        (metaTesting ? 1 : 0) +
        (teasing ? 1 : 0) +
        (apology ? -5 : 0) +
        (positive ? -2 : 0),
    );
    const energy = this.clamp(state.energy + (question ? 1 : 0) + (shortMessage ? -1 : 0) + (longGap ? -5 : 0) + (negative ? -3 : 0));

    return {
      mood: this.selectMood({ positive, negative, apology, question, pressure, boundaryCrossing, vulnerable, metaTesting, teasing, tension }),
      affection,
      trust,
      energy,
      tension,
    };
  }

  private selectMood(input: {
    positive: boolean;
    negative: boolean;
    apology: boolean;
    question: boolean;
    pressure: boolean;
    boundaryCrossing: boolean;
    vulnerable: boolean;
    metaTesting: boolean;
    teasing: boolean;
    tension: number;
  }): RoleplayMood {
    if (input.negative || input.boundaryCrossing || input.tension > 70) {
      return RoleplayMood.annoyed;
    }

    if (input.pressure) {
      return RoleplayMood.annoyed;
    }

    if (input.vulnerable) {
      return RoleplayMood.warm;
    }

    if (input.metaTesting || input.teasing) {
      return RoleplayMood.playful;
    }

    if (input.apology) {
      return RoleplayMood.warm;
    }

    if (input.positive) {
      return RoleplayMood.playful;
    }

    if (input.question) {
      return RoleplayMood.warm;
    }

    return RoleplayMood.neutral;
  }

  private matches(text: string, patterns: string[]): boolean {
    return patterns.some((pattern) => text.includes(pattern));
  }

  private clamp(value: number): number {
    return Math.max(0, Math.min(100, value));
  }
}
