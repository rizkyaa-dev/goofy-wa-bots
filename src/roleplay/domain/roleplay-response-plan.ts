import { RoleplayRoute } from './roleplay-route';

export type RoleplayReplyMode =
  | 'answer_only'
  | 'answer_with_texture'
  | 'react_only'
  | 'react_expand'
  | 'light_follow_up'
  | 'clarify'
  | 'tease'
  | 'deflect'
  | 'quote_evidence';

export type RoleplaySelfDisclosure = 'none' | 'small' | 'normal';

export type RoleplayEmotionalTexture = 'none' | 'small' | 'medium';

export type RoleplayPlayfulness = 'none' | 'light' | 'medium';

export type RoleplayTopicDevelopment = 'none' | 'micro' | 'follow_up';

export type RoleplayReplyShape =
  | 'answer_react'
  | 'answer_texture'
  | 'react_expand'
  | 'comfort_anchor'
  | 'tease_deflect'
  | 'clarify_briefly'
  | 'boundary';

export type RoleplayResponsePlan = {
  route: RoleplayRoute;
  routeConfidence: number;
  mode: RoleplayReplyMode;
  questionAllowed: boolean;
  selfDisclosure: RoleplaySelfDisclosure;
  maxSentences: number;
  emotionalTexture: RoleplayEmotionalTexture;
  playfulness: RoleplayPlayfulness;
  topicDevelopment: RoleplayTopicDevelopment;
  replyShape: RoleplayReplyShape;
  forbiddenTerms: string[];
  routeReason: string;
  directive: string;
};
