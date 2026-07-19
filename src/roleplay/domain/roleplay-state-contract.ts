import { RoleplayMood, RoleplayState } from '@prisma/client';

export type RoleplayStateMetric =
  | 'affection'
  | 'trust'
  | 'energy'
  | 'tension'
  | 'intimacy'
  | 'shyness'
  | 'curiosity'
  | 'volatility'
  | 'desire'
  | 'inhibition'
  | 'comfort'
  | 'compliance';

export type RoleplayStatePatch = Pick<RoleplayState, RoleplayStateMetric> & {
  mood: RoleplayMood;
};

export type RoleplayStateDelta = Partial<Record<RoleplayStateMetric, number>>;
