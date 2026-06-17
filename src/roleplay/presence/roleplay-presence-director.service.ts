import { Injectable } from '@nestjs/common';
import { RoleplayPresenceState, RoleplayState } from '@prisma/client';
import { LlmMessage } from '../../llm/domain/llm.types';
import { RoleplayEmotionAnalysis } from '../domain/roleplay-emotion-analysis';
import {
  RoleplayPresenceActivityType,
  RoleplayPresenceDecision,
  RoleplayPresenceDraft,
  RoleplayPresenceInterruptibility,
  RoleplayPresenceSocialContext,
} from './domain/roleplay-presence.types';

type BuildScheduledInput = {
  chatId: string;
  state: RoleplayState;
  now: Date;
};

type ConversationReactionInput = {
  current: RoleplayPresenceState;
  latestUserMessage: string;
  recentMessages: LlmMessage[];
  state: RoleplayState;
  analysis: RoleplayEmotionAnalysis;
  now: Date;
};

type PresenceBlueprint = {
  activityType: RoleplayPresenceActivityType;
  locationLabel: string;
  socialContext: RoleplayPresenceSocialContext;
  interruptibility: RoleplayPresenceInterruptibility;
  priority: number;
  durationMinutes: [number, number];
  statusOptions: string[];
};

@Injectable()
export class RoleplayPresenceDirectorService {
  createScheduledPresence(input: BuildScheduledInput): RoleplayPresenceDecision {
    const nowWib = this.toJakartaDate(input.now);
    const daypart = this.resolveDaypart(nowWib.getHours());
    const candidates = this.resolveCandidates(daypart, input.state);
    const slotKey = `${daypart}:${nowWib.getFullYear()}-${nowWib.getMonth()}-${nowWib.getDate()}-${Math.floor((nowWib.getHours() * 60 + nowWib.getMinutes()) / 20)}`;
    const blueprint = candidates[this.hash(`${input.chatId}:${slotKey}:${input.state.mood}:${input.state.energy}`) % candidates.length];
    const durationMinutes = this.pickDurationMinutes(blueprint.durationMinutes, input.chatId, slotKey);
    const startedAt = new Date(input.now);
    const expiresAt = new Date(startedAt.getTime() + durationMinutes * 60 * 1000);

    return {
      action: 'replace',
      draft: {
        activityType: blueprint.activityType,
        statusText: this.pickStatusText(blueprint.statusOptions, input.chatId, `${slotKey}:status`),
        locationLabel: blueprint.locationLabel,
        socialContext: blueprint.socialContext,
        interruptibility: blueprint.interruptibility,
        source: 'scheduled',
        priority: blueprint.priority,
        startedAt,
        expiresAt,
        lastReason: `scheduled_${daypart}`,
      },
      reason: `Scheduled ${daypart} presence refresh.`,
    };
  }

  createConversationReaction(input: ConversationReactionInput): RoleplayPresenceDecision {
    const lower = input.latestUserMessage.toLowerCase();

    if (this.isLateReplyQuestion(lower)) {
      return {
        action: 'adjust',
        draft: {
          ...this.toDraft(input.current),
          statusText: this.createLateReplyStatus(input.current),
          source: 'conversation',
          priority: 20,
          startedAt: input.now,
          expiresAt: new Date(input.now.getTime() + 30 * 60 * 1000),
          lastReason: 'conversation_late_reply',
        },
        reason: 'User asked about response delay, so the presence should surface as a brief excuse.',
      };
    }

    const reminderBlueprint = this.resolveReminderActivity(lower, input.state, input.now);
    if (reminderBlueprint) {
      return {
        action: 'replace',
        draft: {
          ...reminderBlueprint,
          source: 'conversation',
          priority: 22,
          startedAt: input.now,
          expiresAt: new Date(input.now.getTime() + 35 * 60 * 1000),
          lastReason: 'conversation_reminder_shift',
        },
        reason: 'User reminder nudged the character into a more specific off-chat activity.',
      };
    }

    if (this.isPresenceProbe(lower)) {
      return {
        action: 'keep',
        draft: this.toDraft(input.current),
        reason: 'User is probing current activity/location, so the existing presence should be exposed rather than replaced.',
      };
    }

    if (input.analysis.userTone === 'vulnerable' || input.analysis.userTone === 'annoyed' || input.analysis.userTone === 'pressuring') {
      return {
        action: 'adjust',
        draft: {
          ...this.toDraft(input.current),
          interruptibility: 'high',
          source: input.current.source === 'scheduled' ? 'conversation' : (input.current.source as any),
          priority: Math.max(input.current.priority, 18),
          lastReason: 'conversation_priority_shift',
        },
        reason: 'Emotionally charged turns should temporarily override background busyness.',
      };
    }

    if (this.shouldSoftenActivity(input.current, input.recentMessages)) {
      return {
        action: 'adjust',
        draft: {
          ...this.toDraft(input.current),
          statusText: this.softenStatusText(input.current.statusText),
          lastReason: 'conversation_soften_presence',
        },
        reason: 'Recent conversation already references presence heavily, so keep it but soften the wording.',
      };
    }

    return {
      action: 'keep',
      draft: this.toDraft(input.current),
      reason: 'No conversational event requires a presence transition.',
    };
  }

  isExpired(presence: RoleplayPresenceState, now: Date): boolean {
    return presence.expiresAt.getTime() <= now.getTime();
  }

  isLockedByHigherPrioritySource(presence: RoleplayPresenceState, now: Date): boolean {
    if (presence.expiresAt.getTime() <= now.getTime()) {
      return false;
    }

    return presence.source === 'manual' || presence.source === 'external';
  }

  private resolveReminderActivity(lower: string, state: RoleplayState, now: Date): Omit<RoleplayPresenceDraft, 'source' | 'priority' | 'startedAt' | 'expiresAt' | 'lastReason'> | null {
    const hour = this.toJakartaDate(now).getHours();

    if (this.matchesAny(lower, ['mandi', 'shower', 'skincare', 'cuci muka', 'rapi-rapi'])) {
      return {
        activityType: 'self_care',
        statusText: 'baru keinget terus lagi siap-siap beresin diri bentar',
        locationLabel: 'rumah',
        socialContext: 'private',
        interruptibility: 'medium',
      };
    }

    if (this.matchesAny(lower, ['makan', 'sarapan', 'lunch', 'dinner', 'ngemil', 'lapar', 'laper'])) {
      return {
        activityType: 'eating',
        statusText: hour < 11 ? 'lagi sarapan santai sebentar' : 'lagi makan pelan-pelan dulu',
        locationLabel: hour < 11 ? 'rumah' : 'meja makan',
        socialContext: 'alone',
        interruptibility: 'medium',
      };
    }

    if (this.matchesAny(lower, ['tidur', 'bobo', 'istirahat', 'rebahan', 'ngantuk'])) {
      if (hour >= 22 || hour <= 5 || state.energy <= 25) {
        return {
          activityType: 'sleeping',
          statusText: 'lagi mode mau bobo sih, udah setengah tumbang',
          locationLabel: 'kamar',
          socialContext: 'private',
          interruptibility: 'low',
        };
      }

      return {
        activityType: 'relaxing',
        statusText: 'lagi rebahan santai bentar sambil ngumpulin tenaga',
        locationLabel: 'kamar',
        socialContext: 'alone',
        interruptibility: 'medium',
      };
    }

    if (this.matchesAny(lower, ['nonton', 'film', 'drakor', 'series', 'youtube'])) {
      return {
        activityType: 'watching',
        statusText: 'lagi nonton santai sambil setengah fokus ke hp',
        locationLabel: 'kamar',
        socialContext: 'alone',
        interruptibility: 'high',
      };
    }

    if (this.matchesAny(lower, ['main game', 'gacha', 'rank', 'push rank', 'mabar', 'game'])) {
      return {
        activityType: 'gaming',
        statusText: 'lagi main bentar tapi belum terlalu serius-serius amat',
        locationLabel: 'kamar',
        socialContext: 'friends',
        interruptibility: 'medium',
      };
    }

    if (this.matchesAny(lower, ['belajar', 'tugas', 'kuliah', 'ngerjain', 'kerja', 'meeting'])) {
      return {
        activityType: state.curiosity >= 60 ? 'studying' : 'working',
        statusText: state.curiosity >= 60 ? 'lagi baca-baca sesuatu sambil nyatet dikit' : 'lagi ngerjain sesuatu bentar',
        locationLabel: 'meja',
        socialContext: 'private',
        interruptibility: 'medium',
      };
    }

    return null;
  }

  private resolveCandidates(daypart: ReturnType<typeof this.resolveDaypart>, state: RoleplayState): PresenceBlueprint[] {
    if (daypart === 'late_night') {
      return [
        this.createBlueprint('sleeping', 'kamar', 'private', 'low', 14, [50, 90], [
          'lagi bobo sih, setengah ilang dari dunia',
          'lagi setengah tidur di kamar, masih pengen narik selimut',
        ]),
        this.createBlueprint('relaxing', 'kamar', 'alone', 'low', 12, [25, 45], [
          'lagi rebahan gelap-gelapan sambil bengong dikit',
          'lagi mode mager total di kamar',
        ]),
      ];
    }

    if (daypart === 'morning') {
      return [
        this.createBlueprint('waking_up', 'kamar', 'private', 'medium', 12, [20, 40], [
          'baru bangun, masih ngumpulin nyawa pelan-pelan',
          'lagi bangun tapi otak belum full online',
        ]),
        this.createBlueprint('eating', 'rumah', 'family', 'medium', 12, [20, 35], [
          'lagi sarapan santai dulu',
          'lagi nyemil pagi sambil pelan-pelan sadar',
        ]),
        this.createBlueprint('self_care', 'rumah', 'private', 'medium', 14, [25, 40], [
          'lagi siap-siap pelan dulu biar keliatan niat hidup',
          'lagi beresin diri bentar sebelum beneran aktif',
        ]),
      ];
    }

    if (daypart === 'late_morning') {
      return [
        this.createBlueprint('working', 'meja', 'private', state.energy <= 35 ? 'medium' : 'high', 14, [35, 55], [
          'lagi ngerjain sesuatu bentar sambil buka hp sesekali',
          'lagi fokus tipis-tipis sama urusan kecil',
        ]),
        this.createBlueprint('studying', 'meja', 'private', 'medium', 15, [35, 60], [
          'lagi baca-baca sesuatu sambil nyatet dikit',
          'lagi ngerapiin pikiran sambil lihat-lihat sesuatu',
        ]),
        this.createBlueprint('idle', 'rumah', 'alone', 'high', 10, [20, 35], [
          'lagi lowong santai aja sebenernya',
          'lagi senggang dikit, jadi lumayan gampang kegoda buka hp',
        ]),
      ];
    }

    if (daypart === 'afternoon') {
      return [
        this.createBlueprint('working', 'meja', 'private', 'medium', 15, [35, 60], [
          'lagi ngerjain sesuatu bentar tapi belum tenggelam banget',
          'lagi sibuk ringan doang sebenernya',
        ]),
        this.createBlueprint('going_out', 'luar bentar', 'crowded', 'low', 18, [25, 50], [
          'lagi di luar bentar, muter sebentar doang',
          'lagi keluar sebentar, belum jauh-jauh amat',
        ]),
        this.createBlueprint('relaxing', 'rumah', 'alone', 'high', 11, [20, 35], [
          'lagi santai sambil scroll-scroll iseng',
          'lagi nyuri waktu buat leha-leha bentar',
        ]),
      ];
    }

    if (daypart === 'evening') {
      return [
        this.createBlueprint('commuting', 'jalan', 'crowded', 'low', 18, [20, 45], [
          'lagi di jalan bentar, belum settle penuh',
          'lagi transisi pulang jadi fokusku kebagi dikit',
        ]),
        this.createBlueprint('eating', 'meja makan', 'family', 'medium', 14, [25, 40], [
          'lagi makan malam pelan-pelan',
          'lagi duduk sambil makan bentar',
        ]),
        this.createBlueprint('chatting_offline', 'rumah', 'friends', 'medium', 14, [20, 35], [
          'lagi ngobrol santai dulu sama orang sekitar',
          'lagi kebawa ngobrol santai off-chat bentar',
        ]),
      ];
    }

    return [
      this.createBlueprint('watching', 'kamar', 'alone', 'high', 13, [25, 45], [
        'lagi nonton santai sambil setengah fokus ke hp',
        'lagi nyetel sesuatu buat nemenin malam',
      ]),
      this.createBlueprint('gaming', 'kamar', 'friends', 'medium', 13, [25, 45], [
        'lagi main bentar buat ngilangin penat',
        'lagi sibuk tipis-tipis sama game, tapi belum hardcore',
      ]),
      this.createBlueprint('relaxing', 'kamar', 'alone', 'high', 12, [20, 40], [
        'lagi rebahan santai sambil scroll-scroll',
        'lagi mode santai total, cuma pegang hp doang',
      ]),
      this.createBlueprint('self_care', 'rumah', 'private', 'medium', 14, [20, 35], [
        'lagi beres-beres diri sedikit sebelum full santai',
        'lagi siap-siap masuk mode malam',
      ]),
    ];
  }

  private createBlueprint(
    activityType: RoleplayPresenceActivityType,
    locationLabel: string,
    socialContext: RoleplayPresenceSocialContext,
    interruptibility: RoleplayPresenceInterruptibility,
    priority: number,
    durationMinutes: [number, number],
    statusOptions: string[],
  ): PresenceBlueprint {
    return {
      activityType,
      locationLabel,
      socialContext,
      interruptibility,
      priority,
      durationMinutes,
      statusOptions,
    };
  }

  private pickDurationMinutes(range: [number, number], chatId: string, key: string): number {
    const [min, max] = range;
    if (max <= min) {
      return min;
    }

    return min + (this.hash(`${chatId}:${key}:duration`) % (max - min + 1));
  }

  private pickStatusText(options: string[], chatId: string, key: string): string {
    return options[this.hash(`${chatId}:${key}`) % options.length];
  }

  private hash(value: string): number {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
    }

    return hash;
  }

  private resolveDaypart(hour: number): 'late_night' | 'morning' | 'late_morning' | 'afternoon' | 'evening' | 'night' {
    if (hour <= 4) {
      return 'late_night';
    }
    if (hour <= 9) {
      return 'morning';
    }
    if (hour <= 11) {
      return 'late_morning';
    }
    if (hour <= 16) {
      return 'afternoon';
    }
    if (hour <= 20) {
      return 'evening';
    }
    return 'night';
  }

  private isPresenceProbe(lower: string): boolean {
    return this.matchesAny(lower, [
      'lagi apa',
      'lagi ngapain',
      'ngapain',
      'lagi di mana',
      'lagi dimana',
      'di mana',
      'dimana',
      'sama siapa',
      'bareng siapa',
      'sedang apa',
    ]);
  }

  private isLateReplyQuestion(lower: string): boolean {
    return this.matchesAny(lower, [
      'kok lama bales',
      'lama bales',
      'baru bales',
      'kok ga bales',
      'kenapa lama',
      'kemana aja',
    ]);
  }

  private createLateReplyStatus(current: RoleplayPresenceState): string {
    return `tadi ${this.normalizeActivityLead(current.statusText)}, baru sempet ngecek hp lagi`;
  }

  private normalizeActivityLead(statusText: string): string {
    return statusText
      .replace(/^lagi\s+/iu, 'lagi ')
      .replace(/^baru\s+/iu, 'baru ')
      .replace(/\s+/gu, ' ')
      .trim();
  }

  private shouldSoftenActivity(current: RoleplayPresenceState, recentMessages: LlmMessage[]): boolean {
    const recentText = recentMessages
      .slice(-4)
      .map((message) => message.content.toLowerCase())
      .join('\n');

    return current.source === 'conversation' && this.matchesAny(recentText, ['lagi apa', 'di mana', 'kemana aja']);
  }

  private softenStatusText(statusText: string): string {
    return statusText
      .replace(/\bsebenernya\b/giu, '')
      .replace(/\s+/gu, ' ')
      .trim();
  }

  private matchesAny(text: string, patterns: string[]): boolean {
    return patterns.some((pattern) => text.includes(pattern));
  }

  private toDraft(presence: RoleplayPresenceState): RoleplayPresenceDraft {
    return {
      activityType: presence.activityType as RoleplayPresenceActivityType,
      statusText: presence.statusText,
      locationLabel: presence.locationLabel,
      socialContext: presence.socialContext as RoleplayPresenceSocialContext,
      interruptibility: presence.interruptibility as RoleplayPresenceInterruptibility,
      source: presence.source as any,
      priority: presence.priority,
      startedAt: presence.startedAt,
      expiresAt: presence.expiresAt,
      lastReason: presence.lastReason,
    };
  }

  private toJakartaDate(now: Date): Date {
    return new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  }
}
