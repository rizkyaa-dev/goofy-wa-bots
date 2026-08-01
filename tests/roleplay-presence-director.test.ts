import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RoleplayPresenceDirectorService } from '../src/roleplay/presence/roleplay-presence-director.service';

const state = {
  mood: 'neutral', affection: 20, trust: 20, energy: 60, tension: 10, intimacy: 0, shyness: 20, curiosity: 60,
} as never;

describe('RoleplayPresenceDirectorService', () => {
  it('uses specific scheduled status text without vague filler', () => {
    const director = new RoleplayPresenceDirectorService();
    const blueprints = (director as any).resolveCandidates('late_morning', state) as Array<{ statusOptions: string[] }>;

    for (const status of blueprints.flatMap((blueprint) => blueprint.statusOptions)) {
      assert.doesNotMatch(status, /\b(?:bentar|dikit|sesuatu)\b/iu);
    }
    assert.deepEqual(blueprints[0].statusOptions, ['lagi ngerjain kerjaan', 'lagi fokus kerja']);
    assert.deepEqual(blueprints[1].statusOptions, ['lagi baca materi', 'lagi nyatet materi']);
  });
});
