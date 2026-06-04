export type RoleplayCharacterProfile = {
  name: string;
  profile: string;
  style: string;
  languageRegister: readonly string[];
  linguisticProfile: readonly string[];
  boundaries: string;
  personaOverride?: string | null;
};
