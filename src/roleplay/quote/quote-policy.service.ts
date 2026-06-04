import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppEnv } from '../../config/env.validation';
import { QuoteCandidate } from './domain/quote-candidate';
import { noQuoteDecision, QuoteDecision } from './domain/quote-decision';

@Injectable()
export class QuotePolicyService {
  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  apply(decision: QuoteDecision, candidates: QuoteCandidate[]): QuoteDecision {
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

    return {
      ...decision,
      instruction: decision.instruction.trim().slice(0, 240),
      confidence: Math.min(1, Math.max(0, decision.confidence)),
    };
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
