export type QuoteIntent =
  | 'none'
  | 'clarify'
  | 'evidence'
  | 'tease'
  | 'callback'
  | 'contradiction'
  | 'boundary'
  | 'emotional_recall';

export type QuoteAction = 'none' | 'quote_reply';

export type QuoteDecision = {
  action: QuoteAction;
  targetMessageId?: string;
  intent: QuoteIntent;
  instruction: string;
  confidence: number;
};

export const noQuoteDecision: QuoteDecision = {
  action: 'none',
  intent: 'none',
  instruction: '',
  confidence: 0,
};
