import { WebSearchInput, WebSearchIntent } from '../../web-search/domain/web-search.types';

export type SearchDecisionTarget =
  | 'external_world'
  | 'character_self'
  | 'relationship'
  | 'memory'
  | 'roleplay_state'
  | 'unclear';

export type SearchDecisionSource = 'deterministic' | 'classifier' | 'disabled' | 'fallback';

export type SearchIntentDecision = {
  needsWebSearch: boolean;
  intent: WebSearchIntent | null;
  target: SearchDecisionTarget;
  freshnessNeeded: boolean;
  queryRewrite?: string;
  confidence: number;
  reason: string;
  source: SearchDecisionSource;
};

export type SearchDetectionResult = {
  request: WebSearchInput | null;
  decision: SearchIntentDecision;
};

