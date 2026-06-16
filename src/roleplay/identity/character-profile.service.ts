import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppEnv } from '../../config/env.validation';
import { defaultRoleplayCharacter } from '../domain/default-roleplay-character';
import { RoleplayCharacterProfile } from '../domain/roleplay-character-profile';

@Injectable()
export class CharacterProfileService {
  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  getProfile(personaOverride?: string | null): RoleplayCharacterProfile {
    return {
      name: this.config.get('ROLEPLAY_CHARACTER_NAME'),
      profile: this.config.get('ROLEPLAY_CHARACTER_PROFILE'),
      style: defaultRoleplayCharacter.style,
      languageRegister: defaultRoleplayCharacter.languageRegister,
      linguisticProfile: defaultRoleplayCharacter.linguisticProfile,
      boundaries: defaultRoleplayCharacter.boundaries,
      personaOverride,
    };
  }
}
