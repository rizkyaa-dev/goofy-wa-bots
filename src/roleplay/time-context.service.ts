import { Injectable } from '@nestjs/common';
import { RoleplayState } from '@prisma/client';
import { RoleplayTimeContext } from './domain/roleplay-time-context';

@Injectable()
export class TimeContextService {
  create(state: RoleplayState, now = new Date()): RoleplayTimeContext {
    const minutesSinceLastInteraction = state.lastInteractionAt
      ? Math.max(0, Math.floor((now.getTime() - state.lastInteractionAt.getTime()) / 60000))
      : undefined;

    return {
      nowText: new Intl.DateTimeFormat('id-ID', {
        dateStyle: 'full',
        timeStyle: 'short',
        timeZone: 'Asia/Jakarta',
      }).format(now),
      dayPeriod: this.getDayPeriod(now),
      lastInteractionText: this.formatLastInteraction(minutesSinceLastInteraction),
      minutesSinceLastInteraction,
    };
  }

  private getDayPeriod(now: Date): RoleplayTimeContext['dayPeriod'] {
    const hour = Number(
      new Intl.DateTimeFormat('en-US', {
        hour: '2-digit',
        hour12: false,
        timeZone: 'Asia/Jakarta',
      }).format(now),
    );

    if (hour >= 5 && hour < 11) {
      return 'morning';
    }

    if (hour >= 11 && hour < 16) {
      return 'afternoon';
    }

    if (hour >= 16 && hour < 21) {
      return 'evening';
    }

    return 'night';
  }

  private formatLastInteraction(minutes?: number): string {
    if (typeof minutes !== 'number') {
      return 'Belum ada interaksi sebelumnya.';
    }

    if (minutes < 2) {
      return 'Baru saja.';
    }

    if (minutes < 60) {
      return `${minutes} menit lalu.`;
    }

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `${hours} jam lalu.`;
    }

    return `${Math.floor(hours / 24)} hari lalu.`;
  }
}
