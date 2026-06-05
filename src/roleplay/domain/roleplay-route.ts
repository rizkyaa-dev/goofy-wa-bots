export type RoleplayRoute =
  | 'answer_identity'
  | 'smalltalk_react'
  | 'smalltalk_continue'
  | 'tease_deflect'
  | 'emotional_care'
  | 'conflict_boundary'
  | 'ambiguous_clarify'
  | 'memory_recall'
  | 'quote_evidence'
  | 'meta_testing'
  | 'casual_default';

export type RoleplayRouteDecision = {
  route: RoleplayRoute;
  confidence: number;
  tone: string;
  questionAllowed?: boolean;
  selfDisclosure?: 'none' | 'small' | 'normal';
  needsMemory: boolean;
  needsQuote: boolean;
  reason: string;
};

export const roleplayRoutes: readonly RoleplayRoute[] = [
  'answer_identity',
  'smalltalk_react',
  'smalltalk_continue',
  'tease_deflect',
  'emotional_care',
  'conflict_boundary',
  'ambiguous_clarify',
  'memory_recall',
  'quote_evidence',
  'meta_testing',
  'casual_default',
] as const;
