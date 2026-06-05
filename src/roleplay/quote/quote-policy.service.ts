import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppEnv } from '../../config/env.validation';
import { QuoteCandidate } from './domain/quote-candidate';
import { noQuoteDecision, QuoteDecision } from './domain/quote-decision';

@Injectable()
export class QuotePolicyService {
  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  apply(decision: QuoteDecision, candidates: QuoteCandidate[], latestMessageId?: string): QuoteDecision {
    if (!this.config.get('ROLEPLAY_QUOTE_ENGINE_ENABLED')) {
      return noQuoteDecision;
    }

    if (decision.action !== 'quote_reply' || !decision.targetMessageId) {
      return noQuoteDecision;
    }

    if (decision.confidence < this.config.get('ROLEPLAY_QUOTE_MIN_CONFIDENCE')) {
      return noQuoteDecision;
    }

    const candidate = candidates.find((item) => item.messageId === decision.targetMessageId);

    if (!candidate || this.isUnsafeCandidate(candidate)) {
      return noQuoteDecision;
    }

    if (this.isInvalidLatestMessageQuote(decision, candidate, latestMessageId)) {
      return noQuoteDecision;
    }

    return {
      ...decision,
      instruction: decision.instruction.trim().slice(0, 240),
      confidence: Math.min(1, Math.max(0, decision.confidence)),
    };
  }

  private isInvalidLatestMessageQuote(
    decision: QuoteDecision,
    candidate: QuoteCandidate,
    latestMessageId?: string,
  ): boolean {
    if (!latestMessageId || candidate.messageId !== latestMessageId) {
      return false;
    }

    if (decision.intent === 'clarify') {
      return this.looksLikeEvidenceRequest(candidate.body);
    }

    return decision.intent === 'evidence' || decision.intent === 'contradiction' || decision.intent === 'callback';
  }

  private looksLikeEvidenceRequest(text: string): boolean {
    const lower = text.toLowerCase();
    return /\b(?:bukti|mana|kapan|pernah|reply|quote|kutip)\b/u.test(lower);
  }

  private isUnsafeCandidate(candidate: QuoteCandidate): boolean {
    const text = candidate.body.trim().toLowerCase();

    return (
      text.length === 0 ||
      /^[!/]/u.test(text) ||
      /(?:api[_ -]?key|password|token|otp|pin|kode verifikasi|rekening|kartu kredit|cvv)/iu.test(text)
    );
  }
}
