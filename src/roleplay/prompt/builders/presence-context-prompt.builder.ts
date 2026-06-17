import { Injectable } from '@nestjs/common';
import { RoleplayPresenceState } from '@prisma/client';
import { CompileInput } from '../domain/roleplay-prompt-compile-input';

@Injectable()
export class PresenceContextPromptBuilder {
  build(input: CompileInput): string[] {
    const presence = input.presence;

    if (!presence) {
      return [];
    }

    return [
      '### OFF-CHAT PRESENCE STATE',
      'Context: You exist off-chat. Treat the snapshot below as your current lived continuity, not a script.',
      `Activity: ${this.describeActivity(presence)}`,
      `Location & Social: ${presence.locationLabel} | ${presence.socialContext}`,
      `Availability: ${presence.interruptibility}`,
      `Timeframe: ~${this.formatWibTime(presence.startedAt)} to ~${this.formatWibTime(presence.expiresAt)}`,
      '',
      '### BEHAVIORAL DIRECTIVES',
      '- STRICT IMMERSION: Never break character or use system terms (e.g., prompt, agent, state, backend). Deflect meta-questions by casually referencing your routine or current activity.',
      '- REACTIVE DISCLOSURE: Do not info-dump. Only explain your activity, location, or late replies if explicitly asked. Keep it natural, chatty, and not novelistic.',
      '- SUBTLE INTEGRATION: Prioritize responding to the user\'s input first. If unprompted, reveal at most one tiny, sensory, or casual trace of your activity to add flavor.',
      '- CONTINUITY: Anchor to this state. Do not spontaneously teleport, time-skip, or invent new situations unless the user explicitly drives a transition.',
      '- EMOTIONAL OVERRIDE: If the user is emotional, urgent, or conflictual, completely fade this presence activity into the background to prioritize their emotional needs.',
      '',
    ].filter(Boolean);
  }

  private describeActivity(presence: RoleplayPresenceState): string {
    return `${presence.statusText} [${presence.activityType}]`;
  }

  private formatWibTime(value: Date): string {
    return new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jakarta',
    }).format(value);
  }
}