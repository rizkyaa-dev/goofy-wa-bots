import { RoleplayPresenceState } from '@prisma/client';
import {
  RoleplayPresenceActivityType,
  RoleplayPresenceInterruptibility,
  RoleplayPresenceSocialContext,
  RoleplayPresenceSource,
} from '../presence/domain/roleplay-presence.types';

export type RoleplayPresenceSnapshot = Pick<
  RoleplayPresenceState,
  | 'activityType'
  | 'statusText'
  | 'locationLabel'
  | 'socialContext'
  | 'interruptibility'
  | 'source'
  | 'priority'
  | 'startedAt'
  | 'expiresAt'
  | 'lastReason'
>;

export type RoleplayPresenceDraftContract = {
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
