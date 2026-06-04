export type RoleplayUserTone =
  | 'neutral'
  | 'warm'
  | 'playful'
  | 'teasing'
  | 'vulnerable'
  | 'annoyed'
  | 'pressuring'
  | 'awkward';

export type RoleplayEmotionAnalysis = {
  userTone: RoleplayUserTone;
  userIntent: string;
  affectionDelta: number;
  trustDelta: number;
  tensionDelta: number;
  energyDelta: number;
  avoidQuestion: boolean;
  replyDirective: string;
};
