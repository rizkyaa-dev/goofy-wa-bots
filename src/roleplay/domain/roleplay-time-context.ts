export type RoleplayTimeContext = {
  nowText: string;
  dayPeriod: 'morning' | 'afternoon' | 'evening' | 'night';
  lastInteractionText: string;
  minutesSinceLastInteraction?: number;
};
