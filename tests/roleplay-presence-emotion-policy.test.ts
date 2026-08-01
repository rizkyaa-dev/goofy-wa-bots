import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RoleplayPresenceEmotionPolicyService } from '../src/roleplay/presence/roleplay-presence-emotion-policy.service';

const state = {
  mood: 'neutral', affection: 20, trust: 20, energy: 60, tension: 10, intimacy: 0, shyness: 20, curiosity: 60,
} as never;

const draft = {
  activityType: 'studying',
  statusText: 'lagi baca materi',
  locationLabel: 'meja',
  socialContext: 'private',
  interruptibility: 'medium',
  source: 'scheduled',
  priority: 15,
  startedAt: new Date('2026-08-01T08:00:00.000Z'),
  expiresAt: new Date('2026-08-01T09:00:00.000Z'),
  lastReason: 'scheduled_late_morning',
} as never;

describe('RoleplayPresenceEmotionPolicyService', () => {
  it('keeps semantic activity and does not add filler to its status', () => {
    const service = new RoleplayPresenceEmotionPolicyService();
    const result = service.apply({ draft, state });

    assert.equal(result.draft.activityType, 'studying');
    assert.equal(result.draft.statusText, 'lagi baca materi');
    assert.doesNotMatch(result.draft.statusText, /\b(?:bentar|dikit|sesuatu)\b/iu);
  });
});
