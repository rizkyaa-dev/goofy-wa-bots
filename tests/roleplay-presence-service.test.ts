import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RoleplayPresenceService } from '../src/roleplay/presence/roleplay-presence.service';

const state = {
  mood: 'neutral', affection: 20, trust: 20, energy: 60, tension: 10, intimacy: 0, shyness: 20, curiosity: 60,
} as never;

const legacyPresence = {
  chatId: 'test@c.us',
  activityType: 'working',
  statusText: 'lagi ngerjain sesuatu bentar',
  locationLabel: 'meja',
  socialContext: 'private',
  interruptibility: 'medium',
  source: 'scheduled',
  priority: 15,
  startedAt: new Date('2026-08-02T00:00:00.000Z'),
  expiresAt: new Date('2026-08-02T03:00:00.000Z'),
  lastReason: 'scheduled_late_morning',
} as Record<string, unknown>;

describe('RoleplayPresenceService', () => {
  it('refreshes active scheduled snapshots created with legacy filler', async () => {
    let saved = false;
    const replacement = { ...legacyPresence, statusText: 'lagi ngerjain kerjaan' };
    const service = new RoleplayPresenceService(
      { enhance: async ({ baseline }: { baseline: unknown }) => baseline } as never,
      {
        isLockedByHigherPrioritySource: () => false,
        isExpired: () => false,
        createScheduledPresence: () => ({
          draft: replacement,
          reason: 'scheduled_refresh',
        }),
      } as never,
      { apply: ({ draft }: { draft: unknown }) => ({ draft, bias: { moodDrive: 'neutral_routine' } }) } as never,
      {
        findByChatId: async () => legacyPresence,
        save: async () => {
          saved = true;
          return replacement;
        },
      } as never,
    );

    const result = await service.ensureCurrentPresence('test@c.us', state, new Date('2026-08-02T01:00:00.000Z'));

    assert.equal(saved, true);
    assert.equal(result.statusText, 'lagi ngerjain kerjaan');
  });
});
