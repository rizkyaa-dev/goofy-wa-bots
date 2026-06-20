import { Injectable } from '@nestjs/common';
import { RoleplayState } from '@prisma/client';
import { RoleplayEmotionAnalysis } from '../domain/roleplay-emotion-analysis';
import {
  RoleplayPresenceActivityType,
  RoleplayPresenceDraft,
  RoleplayPresenceEmotionalBias,
  RoleplayPresenceInterruptibility,
  RoleplayPresenceSocialContext,
  RoleplayPresenceWordingStyle,
} from './domain/roleplay-presence.types';

type ApplyBiasInput = {
  draft: RoleplayPresenceDraft;
  state: RoleplayState;
  analysis?: RoleplayEmotionAnalysis;
};

type ActivityDefaults = {
  statusText: string;
  locationLabel: string;
  socialContext: RoleplayPresenceSocialContext;
};

@Injectable()
export class RoleplayPresenceEmotionPolicyService {
  createBias(state: RoleplayState, analysis?: RoleplayEmotionAnalysis): RoleplayPresenceEmotionalBias {
    const mood = String(state.mood);
    const energy = state.energy;
    const tension = state.tension;
    const affection = state.affection;
    const trust = state.trust;
    const volatility = this.getStateValue(state, 'volatility', 15);
    const desire = this.getStateValue(state, 'desire', 20);
    const inhibition = this.getStateValue(state, 'inhibition', 55);
    const comfort = this.getStateValue(state, 'comfort', 55);
    const userTone = analysis?.userTone;

    if (mood === 'sleepy' || energy <= 25) {
      return this.bias('low_energy', ['sleeping', 'relaxing', 'self_care'], ['going_out', 'gaming'], 'low', 'tired_soft', 'mood_low_energy', 'Prefer a quiet, low-energy activity with sleepy or slow wording.');
    }

    if (mood === 'annoyed' || tension >= 65 || userTone === 'annoyed' || userTone === 'pressuring') {
      return this.bias('guarded', ['working', 'idle', 'self_care', 'going_out'], ['chatting_offline'], 'medium', 'clipped_private', 'emotion_guarded_tension', 'Prefer a guarded, slightly private activity; do not sound eager or overly available.');
    }

    if (mood === 'worried' || userTone === 'vulnerable') {
      return this.bias('distracted_care', ['idle', 'self_care', 'relaxing'], ['gaming', 'going_out'], 'high', 'distracted_soft', 'emotion_distracted_care', 'Prefer a soft, interruptible activity that can fade behind emotional care.');
    }

    if ((mood === 'playful' || mood === 'excited') && energy >= 55 && tension < 45) {
      return this.bias('playful_active', ['gaming', 'watching', 'going_out', 'chatting_offline'], ['sleeping'], 'high', 'bright_casual', 'mood_playful_active', 'Prefer a light, active, casual activity with playful texture.');
    }

    if (mood === 'warm' && affection >= 65 && trust >= 55 && tension < 40) {
      return this.bias('warm_available', ['relaxing', 'chatting_offline', 'eating', 'idle'], ['working'], 'high', 'soft_available', 'mood_warm_available', 'Prefer an available, gentle daily activity; do not over-explain the scene.');
    }

    if (
      mood === 'sensual' ||
      mood === 'flirty' ||
      mood === 'aroused' ||
      mood === 'unrestrained' ||
      (desire >= 65 && comfort >= 55 && inhibition <= 45 && tension < 50)
    ) {
      return this.bias('private_charged', ['relaxing', 'self_care', 'idle'], ['commuting', 'going_out'], 'medium', 'private_subtle', 'drive_private_charged', 'Prefer a private, subtle, sensual activity. If the bot mood is aroused or unrestrained, the activity can be mildly suggestive, intimate, or ecchi (e.g. reading adult/erotic romance novel, taking a warm private bath, resting after intimacy) but not graphically explicit.');
    }

    if (mood === 'swing' || volatility >= 70) {
      return this.bias('restless', ['idle', 'relaxing', 'working'], ['sleeping'], 'medium', 'restless_light', 'mood_restless_volatility', 'Prefer a light, slightly restless activity with ordinary wording.');
    }

    return this.bias('neutral_routine', ['working', 'relaxing', 'idle', 'eating'], [], 'medium', 'ordinary', 'mood_neutral_routine', 'Keep the baseline ordinary and believable.');
  }

  apply(input: ApplyBiasInput): { draft: RoleplayPresenceDraft; bias: RoleplayPresenceEmotionalBias } {
    const bias = this.createBias(input.state, input.analysis);

    if (input.draft.source === 'manual' || input.draft.source === 'external') {
      return { draft: input.draft, bias };
    }

    const shouldRetargetActivity =
      bias.avoidActivities.includes(input.draft.activityType) ||
      (input.draft.source === 'scheduled' && !bias.activityBias.includes(input.draft.activityType));
    const activityType = shouldRetargetActivity ? bias.activityBias[0] ?? input.draft.activityType : input.draft.activityType;
    const defaults = shouldRetargetActivity ? this.activityDefaults(activityType, bias.wordingStyle) : null;

    const draft: RoleplayPresenceDraft = {
      ...input.draft,
      activityType,
      statusText: defaults?.statusText ?? this.softStyleStatus(input.draft.statusText, bias.wordingStyle),
      locationLabel: defaults?.locationLabel ?? input.draft.locationLabel,
      socialContext: defaults?.socialContext ?? this.adjustSocialContext(input.draft.socialContext, bias),
      interruptibility: this.resolveInterruptibility(input.draft.interruptibility, bias.availabilityBias),
      priority: this.resolvePriority(input.draft.priority, bias),
      lastReason: this.appendReason(input.draft.lastReason, bias.reasonTag),
    };

    return { draft, bias };
  }

  private bias(
    moodDrive: RoleplayPresenceEmotionalBias['moodDrive'],
    activityBias: RoleplayPresenceActivityType[],
    avoidActivities: RoleplayPresenceActivityType[],
    availabilityBias: RoleplayPresenceInterruptibility,
    wordingStyle: RoleplayPresenceWordingStyle,
    reasonTag: string,
    guidance: string,
  ): RoleplayPresenceEmotionalBias {
    return { moodDrive, activityBias, avoidActivities, availabilityBias, wordingStyle, reasonTag, guidance };
  }

  private activityDefaults(activityType: RoleplayPresenceActivityType, style: RoleplayPresenceWordingStyle): ActivityDefaults {
    const defaults: Record<string, ActivityDefaults> = {
      sleeping: { statusText: 'lagi istirahat pelan-pelan dulu', locationLabel: 'kamar', socialContext: 'private' },
      waking_up: { statusText: 'baru bangun dan masih ngumpulin nyawa', locationLabel: 'kamar', socialContext: 'private' },
      eating: { statusText: 'lagi makan santai sebentar', locationLabel: 'rumah', socialContext: 'alone' },
      working: { statusText: 'lagi ngerjain sesuatu bentar', locationLabel: 'meja', socialContext: 'private' },
      studying: { statusText: 'lagi baca-baca sesuatu sambil nyatet dikit', locationLabel: 'meja', socialContext: 'private' },
      commuting: { statusText: 'lagi di jalan bentar', locationLabel: 'jalan', socialContext: 'crowded' },
      relaxing: { statusText: 'lagi santai bentar sambil megang hp', locationLabel: 'rumah', socialContext: 'alone' },
      watching: { statusText: 'lagi nyetel sesuatu buat nemenin santai', locationLabel: 'kamar', socialContext: 'alone' },
      gaming: { statusText: 'lagi main bentar buat ngilangin penat', locationLabel: 'kamar', socialContext: 'friends' },
      chatting_offline: { statusText: 'lagi ngobrol santai sama orang sekitar', locationLabel: 'rumah', socialContext: 'friends' },
      going_out: { statusText: 'lagi keluar sebentar', locationLabel: 'luar bentar', socialContext: 'crowded' },
      self_care: { statusText: 'lagi beresin diri pelan-pelan', locationLabel: 'rumah', socialContext: 'private' },
      idle: { statusText: 'lagi lowong sambil bengong dikit', locationLabel: 'rumah', socialContext: 'alone' },
    };
    const selected = defaults[activityType] ?? {
      statusText: 'lagi ngurus sesuatu kecil bentar',
      locationLabel: 'sekitar rumah',
      socialContext: 'alone',
    };

    return {
      ...selected,
      statusText: this.softStyleStatus(selected.statusText, style),
    };
  }

  private softStyleStatus(statusText: string, style: RoleplayPresenceWordingStyle): string {
    if (style === 'tired_soft') {
      return statusText.replace(/\blagi\b/u, 'lagi pelan-pelan');
    }

    if (style === 'clipped_private') {
      return statusText.replace(/\bsantai\b/u, 'sendiri').replace(/\bdulu\b/u, 'sebentar');
    }

    if (style === 'distracted_soft') {
      return statusText.includes('sambil') ? statusText : `${statusText} sambil agak kepikiran`;
    }

    if (style === 'bright_casual') {
      return statusText.includes('bentar') ? statusText : `${statusText} bentar`;
    }

    if (style === 'soft_available') {
      return statusText.includes('sambil') ? statusText : `${statusText} sambil buka hp`;
    }

    if (style === 'private_subtle') {
      return statusText.replace(/\bramai\b/u, 'sendiri').replace(/\blu(ar|ar bentar)\b/u, 'rumah');
    }

    if (style === 'restless_light') {
      return statusText.includes('tipis') ? statusText : `${statusText} tipis-tipis`;
    }

    return statusText;
  }

  private adjustSocialContext(
    current: RoleplayPresenceSocialContext,
    bias: RoleplayPresenceEmotionalBias,
  ): RoleplayPresenceSocialContext {
    if (bias.moodDrive === 'private_charged' || bias.moodDrive === 'guarded') {
      return current === 'crowded' || current === 'family' ? 'private' : current;
    }

    if (bias.moodDrive === 'warm_available' && current === 'private') {
      return 'alone';
    }

    return current;
  }

  private resolveInterruptibility(
    current: RoleplayPresenceInterruptibility,
    bias: RoleplayPresenceInterruptibility,
  ): RoleplayPresenceInterruptibility {
    const score = { low: 0, medium: 1, high: 2 } as const;
    const values = ['low', 'medium', 'high'] as const;
    const blended = Math.round((score[current] + score[bias]) / 2);
    return values[blended];
  }

  private resolvePriority(priority: number, bias: RoleplayPresenceEmotionalBias): number {
    const delta = bias.moodDrive === 'guarded' || bias.moodDrive === 'low_energy' ? 3 : 1;
    return Math.max(1, Math.min(100, priority + delta));
  }

  private appendReason(current: string | null | undefined, reasonTag: string): string {
    if (!current) {
      return reasonTag;
    }

    if (current.includes(reasonTag)) {
      return current;
    }

    return `${current}_${reasonTag}`.slice(0, 48);
  }

  private getStateValue(
    state: RoleplayState,
    key: 'volatility' | 'desire' | 'inhibition' | 'comfort',
    fallback: number,
  ): number {
    return (state as RoleplayState & Record<typeof key, number | undefined>)[key] ?? fallback;
  }
}
