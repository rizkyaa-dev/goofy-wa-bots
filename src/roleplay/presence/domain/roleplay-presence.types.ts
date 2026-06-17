export const roleplayPresenceSources = ['scheduled', 'conversation', 'manual', 'external'] as const;
export const roleplayPresenceInterruptibilities = ['low', 'medium', 'high'] as const;
export const roleplayPresenceSocialContexts = ['alone', 'family', 'friends', 'crowded', 'private'] as const;
export const roleplayPresenceActivities = [
  'sleeping',
  'waking_up',
  'eating',
  'working',
  'studying',
  'commuting',
  'relaxing',
  'watching',
  'gaming',
  'chatting_offline',
  'going_out',
  'self_care',
  'idle',
] as const;

export type RoleplayPresenceSource = typeof roleplayPresenceSources[number];
export type RoleplayPresenceInterruptibility = typeof roleplayPresenceInterruptibilities[number];
export type RoleplayPresenceSocialContext = typeof roleplayPresenceSocialContexts[number];
export type RoleplayPresenceActivityType = typeof roleplayPresenceActivities[number];
export type RoleplayPresenceTransitionAction = 'keep' | 'adjust' | 'interrupt' | 'replace';

export type RoleplayPresenceDraft = {
  activityType: RoleplayPresenceActivityType;
  statusText: string;
  locationLabel: string;
  socialContext: RoleplayPresenceSocialContext;
  interruptibility: RoleplayPresenceInterruptibility;
  source: RoleplayPresenceSource;
  priority: number;
  startedAt: Date;
  expiresAt: Date;
  lastReason?: string | null;
};

export type RoleplayPresenceDecision = {
  action: RoleplayPresenceTransitionAction;
  draft: RoleplayPresenceDraft;
  reason: string;
};
