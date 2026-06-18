export const roleplayPresenceSources = ['scheduled', 'conversation', 'manual', 'external'] as const;
export const roleplayPresenceInterruptibilities = ['low', 'medium', 'high'] as const;
export const roleplayPresenceSocialContexts = ['alone', 'family', 'friends', 'crowded', 'private'] as const;
export const roleplayPresenceActivityPresets = [
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
export const roleplayPresenceActivities = roleplayPresenceActivityPresets;

export type RoleplayPresenceSource = typeof roleplayPresenceSources[number];
export type RoleplayPresenceInterruptibility = typeof roleplayPresenceInterruptibilities[number];
export type RoleplayPresenceSocialContext = typeof roleplayPresenceSocialContexts[number];
export type RoleplayPresenceActivityPreset = typeof roleplayPresenceActivityPresets[number];
export type RoleplayPresenceActivityType = string;
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

export type RoleplayPresenceMoodDrive =
  | 'neutral_routine'
  | 'low_energy'
  | 'guarded'
  | 'distracted_care'
  | 'playful_active'
  | 'warm_available'
  | 'private_charged'
  | 'restless';

export type RoleplayPresenceWordingStyle =
  | 'ordinary'
  | 'tired_soft'
  | 'clipped_private'
  | 'distracted_soft'
  | 'bright_casual'
  | 'soft_available'
  | 'private_subtle'
  | 'restless_light';

export type RoleplayPresenceEmotionalBias = {
  moodDrive: RoleplayPresenceMoodDrive;
  activityBias: RoleplayPresenceActivityType[];
  avoidActivities: RoleplayPresenceActivityType[];
  availabilityBias: RoleplayPresenceInterruptibility;
  wordingStyle: RoleplayPresenceWordingStyle;
  reasonTag: string;
  guidance: string;
};

const fallbackActivityType = 'idle';
const internalActivityFragments = [
  'prompt',
  'system',
  'developer',
  'instruction',
  'database',
  'scheduler',
  'model',
  'llm',
  'api',
  'token',
  'password',
  'secret',
] as const;

export function normalizeRoleplayPresenceActivityType(value: unknown, fallback = fallbackActivityType): RoleplayPresenceActivityType {
  const normalized = String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '_')
    .replace(/^_+|_+$/gu, '')
    .replace(/_{2,}/gu, '_')
    .slice(0, 48)
    .replace(/^_+|_+$/gu, '');

  if (normalized.length < 2 || internalActivityFragments.some((fragment) => normalized.includes(fragment))) {
    return fallback;
  }

  return normalized;
}
