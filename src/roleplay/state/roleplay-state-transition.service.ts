import { Injectable } from '@nestjs/common';
import { RoleplayEmotionAnalysis } from '../domain/roleplay-emotion-analysis';
import { RoleplayStatePatch } from '../domain/roleplay-state-contract';

@Injectable()
export class RoleplayStateTransitionService {
  applyAnalysis(statePatch: RoleplayStatePatch, analysis: RoleplayEmotionAnalysis): RoleplayStatePatch {
    return {
      ...statePatch,
      affection: this.clampStateValue(statePatch.affection + analysis.affectionDelta),
      trust: this.clampStateValue(statePatch.trust + analysis.trustDelta),
      tension: this.clampStateValue(statePatch.tension + analysis.tensionDelta),
      energy: this.clampStateValue(statePatch.energy + analysis.energyDelta),
      intimacy: this.clampStateValue(statePatch.intimacy + (analysis.intimacyDelta ?? 0)),
      shyness: this.clampStateValue(statePatch.shyness + (analysis.shynessDelta ?? 0)),
      curiosity: this.clampStateValue(statePatch.curiosity + (analysis.curiosityDelta ?? 0)),
      volatility: this.clampStateValue(statePatch.volatility + (analysis.volatilityDelta ?? 0)),
      desire: this.clampStateValue(statePatch.desire + (analysis.desireDelta ?? 0)),
      inhibition: this.clampStateValue(statePatch.inhibition + (analysis.inhibitionDelta ?? 0)),
      comfort: this.clampStateValue(statePatch.comfort + (analysis.comfortDelta ?? 0)),
      compliance: this.clampStateValue(statePatch.compliance + (analysis.complianceDelta ?? 0)),
    };
  }

  private clampStateValue(value: number): number {
    return Math.max(0, Math.min(100, value));
  }
}
