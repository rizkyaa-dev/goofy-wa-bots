export type RoleplayTimeContext = {
  nowText: string;
  dateText: string;
  weekdayText: string;
  isWeekend: boolean;
  dayPeriod: 'morning' | 'afternoon' | 'evening' | 'night';
  lastInteractionText: string;
  minutesSinceLastInteraction?: number;
};
