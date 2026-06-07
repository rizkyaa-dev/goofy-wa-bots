import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppEnv } from '../../config/env.validation';

@Injectable()
export class RoleplayIdentityQuestionDetectorService {
  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  isCharacterNameQuestion(text: string): boolean {
    const normalized = text.toLowerCase();
    const characterName = this.normalizeTerm(this.config.get('ROLEPLAY_CHARACTER_NAME'));
    const escapedName = this.escapeRegex(characterName);

    return new RegExp(
      [
        String.raw`\bnamamu\b`,
        String.raw`\bnama\s+(?:kamu|mu|bot)\b`,
        String.raw`\b(?:kamu|bot)\s+siapa\b`,
        String.raw`\bsiapa\s+(?:kamu|bot)\b`,
        String.raw`\bnama\s+${escapedName}\b`,
        String.raw`\b${escapedName}\s+siapa\b`,
        String.raw`\bsiapa\s+${escapedName}\b`,
      ].join('|'),
      'u',
    ).test(normalized);
  }

  private normalizeTerm(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
