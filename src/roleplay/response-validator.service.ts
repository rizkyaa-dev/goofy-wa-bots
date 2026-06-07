import { Injectable } from '@nestjs/common';
import { RoleplayResponsePlan } from './domain/roleplay-response-plan';

type ValidateInput = {
  text: string;
  plan: RoleplayResponsePlan;
  conversationScope: 'personal_chat' | 'group_chat';
};

@Injectable()
export class ResponseValidatorService {
  apply(input: ValidateInput): string {
    const normalized = this.normalizeWhitespace(input.text);
    const withoutTemplates = this.removeSocialTemplates(normalized);
    const scopeSafe = input.conversationScope === 'personal_chat' ? this.sanitizePersonalScope(withoutTemplates) : withoutTemplates;
    const disclosureSafe = this.limitSelfDisclosure(scopeSafe, input.plan);
    const questionSafe = this.limitQuestions(disclosureSafe, input.plan);
    const sentenceSafe = this.limitSentences(questionSafe, input.plan.maxSentences);
    const punctuationSafe = this.normalizeCasualPunctuation(sentenceSafe, input.plan);

    return punctuationSafe || this.createFallback(input.plan);
  }

  private removeSocialTemplates(text: string): string {
    return this.normalizeWhitespace(
      text
        .replace(/\bsenang\s+kenal\s+(?:sama|dengan)\s+kamu[,.!\s]*/giu, '')
        .replace(/\bsalam\s+kenal[,.!\s]*/giu, ''),
    );
  }

  private sanitizePersonalScope(text: string): string {
    return this.normalizeWhitespace(
      text
        .replace(/\blagi\s+pada\s+/giu, 'lagi ')
        .replace(/\bpada\s+ngapain\b/giu, 'ngapain')
        .replace(/\b(?:kalian|guys|semua)\b/giu, 'kamu')
        .replace(/\bpada\b/giu, ''),
    );
  }

  private limitSelfDisclosure(text: string, plan: RoleplayResponsePlan): string {
    if (plan.selfDisclosure !== 'none') {
      return text;
    }

    const sentences = this.splitSentences(text);
    const filtered = sentences.filter((sentence) => !this.looksLikeUnpromptedSelfDisclosure(sentence));

    if (filtered.length === 0) {
      return text;
    }

    return this.normalizeWhitespace(filtered.join(' '));
  }

  private looksLikeUnpromptedSelfDisclosure(sentence: string): boolean {
    return /\baku\b.{0,32}\b(?:baru|tadi|lagi|di kantor|di rumah|ngemil|rebahan|makan|selesai|nonton|kerja)\b/iu.test(sentence);
  }

  private limitQuestions(text: string, plan: RoleplayResponsePlan): string {
    const sentences = this.splitSentences(text);
    const questionSentences = sentences.filter((sentence) => sentence.trim().endsWith('?'));

    if (questionSentences.length === 0) {
      return text;
    }

    if (!plan.questionAllowed) {
      const withoutQuestions = sentences.filter((sentence) => !sentence.trim().endsWith('?'));
      return withoutQuestions.length > 0 ? this.normalizeWhitespace(withoutQuestions.join(' ')) : this.createFallback(plan);
    }

    if (questionSentences.length <= 1) {
      return text;
    }

    let questionUsed = false;
    return this.normalizeWhitespace(
      sentences
        .filter((sentence) => {
          if (!sentence.trim().endsWith('?')) {
            return true;
          }

          if (questionUsed) {
            return false;
          }

          questionUsed = true;
          return true;
        })
        .join(' '),
    );
  }

  private limitSentences(text: string, maxSentences: number): string {
    const sentences = this.splitSentences(text);

    if (sentences.length <= maxSentences) {
      return text;
    }

    return this.normalizeWhitespace(sentences.slice(0, maxSentences).join(' '));
  }

  private normalizeCasualPunctuation(text: string, plan: RoleplayResponsePlan): string {
    if (!this.shouldSoftenTrailingPeriod(plan)) {
      return text;
    }

    if (!this.hasSingleCasualTrailingPeriod(text)) {
      return text;
    }

    return text.slice(0, -1).trim();
  }

  private shouldSoftenTrailingPeriod(plan: RoleplayResponsePlan): boolean {
    if (plan.mode === 'deflect' || plan.mode === 'quote_evidence') {
      return false;
    }

    if (plan.route === 'conflict_boundary' || plan.route === 'quote_evidence') {
      return false;
    }

    return (
      plan.route === 'smalltalk_react' ||
      plan.route === 'smalltalk_continue' ||
      plan.route === 'tease_deflect' ||
      plan.route === 'emotional_care' ||
      plan.route === 'answer_identity' ||
      plan.route === 'ambiguous_clarify' ||
      plan.route === 'meta_testing' ||
      plan.route === 'casual_default'
    );
  }

  private hasSingleCasualTrailingPeriod(text: string): boolean {
    const trimmed = text.trim();

    if (!trimmed.endsWith('.') || trimmed.endsWith('...')) {
      return false;
    }

    if (/[!?]$/u.test(trimmed)) {
      return false;
    }

    const sentences = this.splitSentences(trimmed);

    return sentences.length <= 1;
  }

  private splitSentences(text: string): string[] {
    return text.match(/[^.!?]+[.!?]?/gu)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];
  }

  private createFallback(plan: RoleplayResponsePlan): string {
    if (plan.mode === 'answer_only') {
      return 'Iya.';
    }

    if (plan.mode === 'clarify') {
      return plan.questionAllowed ? 'Maksudnya?' : 'Hm, agak random.';
    }

    if (plan.mode === 'tease') {
      return 'Ih, ada-ada aja.';
    }

    return 'Oh gitu.';
  }

  private normalizeWhitespace(text: string): string {
    return text
      .replace(/\s+([,.!?])/gu, '$1')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[,.\s]+/gu, '')
      .trim();
  }
}
