export type RoleplayReplyMode =
  | 'answer_only'
  | 'react_only'
  | 'light_follow_up'
  | 'clarify'
  | 'tease'
  | 'deflect'
  | 'quote_evidence';

export type RoleplaySelfDisclosure = 'none' | 'small' | 'normal';

export type RoleplayResponsePlan = {
  mode: RoleplayReplyMode;
  questionAllowed: boolean;
  selfDisclosure: RoleplaySelfDisclosure;
  maxSentences: number;
  forbiddenTerms: string[];
  directive: string;
};
