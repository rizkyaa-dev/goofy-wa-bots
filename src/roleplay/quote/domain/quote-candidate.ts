export type QuoteCandidateReason = 'recent_user_message' | 'memory_source';

export type QuoteCandidate = {
  messageId: string;
  body: string;
  createdAt: Date;
  reasonHint: QuoteCandidateReason;
};
