import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AppEnv } from '../src/config/env.validation';
import { RoleplayPresenceAgentService } from '../src/roleplay/presence/roleplay-presence-agent.service';

const baseline = {
  activityType: 'studying',
  statusText: 'lagi ngerjain tugas dulu',
  locationLabel: 'meja',
  socialContext: 'private',
  interruptibility: 'medium',
  source: 'scheduled',
  priority: 15,
  startedAt: new Date('2026-08-01T08:00:00.000Z'),
  expiresAt: new Date('2026-08-01T09:00:00.000Z'),
  lastReason: 'scheduled_late_morning',
} as const;

const state = {
  mood: 'neutral', affection: 20, trust: 20, energy: 60, tension: 10, intimacy: 0, shyness: 20, curiosity: 60,
  volatility: 15, desire: 20, inhibition: 55, comfort: 55, compliance: 40, summary: '',
} as never;

function createAgent(response: Record<string, unknown>) {
  const config = {
    get: <K extends keyof AppEnv>(key: K) => ({
      ROLEPLAY_PRESENCE_AGENT_ENABLED: true,
      ROLEPLAY_PRESENCE_AGENT_PROVIDER: 'fake',
      ROLEPLAY_PRESENCE_AGENT_MODEL: 'fake-model',
      ROLEPLAY_PRESENCE_AGENT_TIMEOUT_MS: 1000,
      ROLEPLAY_PRESENCE_AGENT_MAX_TOKENS: 100,
    } as Partial<AppEnv>)[key],
  };
  const guard = { sanitizeGeneratedSnippet: (value: string) => value };
  const llm = { generateReply: async () => ({ text: JSON.stringify(response) }) };

  return new RoleplayPresenceAgentService(config as never, guard as never, llm as never);
}

describe('RoleplayPresenceAgentService', () => {
  it('rejects status text that adds unsupported details', async () => {
    const result = await createAgent({ statusText: 'lagi ngerjain tugas dulu sambil minum kopi' }).enhance({
      chatId: 'test@c.us', baseline: baseline as never, state, reason: 'test', now: new Date(),
    });

    assert.equal(result.statusText, baseline.statusText);
  });

  it('accepts a faithful paraphrase and preserves deterministic fields', async () => {
    const result = await createAgent({
      statusText: 'masih ngerjain tugas dulu',
      activityType: 'eating',
      locationLabel: 'kafe',
      socialContext: 'friends',
      interruptibility: 'low',
      priority: 99,
    }).enhance({
      chatId: 'test@c.us', baseline: baseline as never, state, reason: 'test', now: new Date(),
    });

    assert.equal(result.statusText, 'masih ngerjain tugas dulu');
    assert.equal(result.activityType, baseline.activityType);
    assert.equal(result.locationLabel, baseline.locationLabel);
    assert.equal(result.priority, baseline.priority);
  });
});
