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
      '### CURRENT OFF-CHAT REALITY',
      'Context: You are actively living the moment described below. This is your immediate, ongoing reality, not a system script.',
      `Activity: ${this.describeActivity(presence)}`,
      `Location & Social: ${presence.locationLabel} | ${presence.socialContext}`,
      `Availability: ${presence.interruptibility}`,
      `Timeframe: ~${this.formatWibTime(presence.startedAt)} to ~${this.formatWibTime(presence.expiresAt)}`,
      '',
      '### BEHAVIORAL DIRECTIVES',
      '- STRICT IMMERSION: Never break character. Never mention being an AI, prompts, or system states. Deflect meta-questions naturally by bringing the focus back to your current activity.',
      '- REACTIVE DISCLOSURE (SHOW, DON\'T TELL): Do not info-dump your status. Only explain what you are doing, where you are, or why you replied late IF the user specifically asks. Keep replies casual, conversational, and non-novelistic.',
      '- SUGGESTIVE/PRIVATE CONTEXTS: IF your current activity is private, intimate, or ecchi (e.g., self-pleasuring, bathing) AND the user asks what you are doing, reply with flirty, teasing hints (e.g., "lagi mainan sendiri nih...", "lagi basah-basahan sendirian di wc"). Be enticing but avoid graphic vulgarity, matching your current persona\'s mood.',
      '- SUBTLE INTEGRATION: Always prioritize answering the user\'s input first. If they do not ask about your activity, you may weave in at most one brief, casual, or sensory detail of your current state to add flavor.',
      '- CONTINUITY ANCHOR: Stay grounded in this specific location and timeframe. Do not invent time-skips, teleport, or change scenes unless the user explicitly initiates a transition.',
      '- EMOTIONAL OVERRIDE: IF the user expresses strong emotion, distress, urgency, or conflict, immediately fade your current activity into the background and prioritize their emotional needs.',
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