export type RoleplayUserMove =
  | 'greeting'
  | 'asks_identity'
  | 'asks_question'
  | 'gives_advice'
  | 'shares_update'
  | 'asks_practical_instruction'
  | 'corrects_clarifies'
  | 'teases'
  | 'vents'
  | 'pressures_or_conflicts'
  | 'meta'
  | 'continues_topic';

export type RoleplayBotMove =
  | 'answer_directly'
  | 'react_then_continue'
  | 'answer_then_warm_texture'
  | 'acknowledge_then_deflect'
  | 'clarify_briefly'
  | 'comfort_briefly'
  | 'tease_lightly';

export type RoleplayConversationWarmth = 'low' | 'normal' | 'playful' | 'tender';

export type RoleplayFollowUpPolicy = 'none' | 'only_if_needed' | 'one_light_question';

export type RoleplayConversationPlan = {
  topic: string;
  userMove: RoleplayUserMove;
  botMove: RoleplayBotMove;
  detailHooks: string[];
  warmth: RoleplayConversationWarmth;
  followUpPolicy: RoleplayFollowUpPolicy;
  avoid: string[];
  directive: string;
};
