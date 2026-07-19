import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RoleplayMood } from '@prisma/client';
import { RoleplayStateTransitionService } from '../src/roleplay/state/roleplay-state-transition.service';

describe('RoleplayStateTransitionService', () => {
  it('applies analysis deltas and clamps values to the valid state range', () => {
    const service = new RoleplayStateTransitionService();
    const next = service.applyAnalysis(
      {
        mood: RoleplayMood.neutral,
        affection: 98,
        trust: 2,
        energy: 50,
        tension: 50,
        intimacy: 50,
        shyness: 50,
        curiosity: 50,
        volatility: 50,
        desire: 50,
        inhibition: 50,
        comfort: 50,
        compliance: 50,
      },
      {
        userTone: 'warm',
        userIntent: 'test',
        avoidQuestion: false,
        affectionDelta: 10,
        trustDelta: -10,
        energyDelta: 1,
        tensionDelta: -1,
        intimacyDelta: 2,
        shynessDelta: -2,
        curiosityDelta: 3,
        volatilityDelta: -3,
        desireDelta: 4,
        inhibitionDelta: -4,
        comfortDelta: 5,
        complianceDelta: -5,
        replyDirective: 'continue naturally',
      },
    );

    assert.equal(next.affection, 100);
    assert.equal(next.trust, 0);
    assert.equal(next.energy, 51);
    assert.equal(next.tension, 49);
    assert.equal(next.comfort, 55);
  });
});
