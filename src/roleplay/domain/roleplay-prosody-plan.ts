export type RoleplayProsodyRhythm =
  | 'single_direct'
  | 'soft_pingpong'
  | 'warm_layered'
  | 'playful_stutter'
  | 'low_energy';

export type RoleplayProsodyPlan = {
  enabled: boolean;
  maxBubbles: number;
  rhythm: RoleplayProsodyRhythm;
  socialBeats: string[];
  delimiter: string;
  interBubbleDelayMs: number;
  directive: string;
};
