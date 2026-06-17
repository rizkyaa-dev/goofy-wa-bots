export type RoleplaySexualExplicitness = 'none' | 'suggestive' | 'sensual' | 'explicit_soft' | 'explicit_raw';

export type RoleplaySexualTone =
  | 'nonsexual'
  | 'playful_flirt'
  | 'sensual_restraint'
  | 'direct_adult'
  | 'raw_adult'
  | 'boundary';

export type RoleplayUserSexualIntent = 'none' | 'flirt' | 'sensual' | 'explicit' | 'pressuring' | 'unsafe';

export type RoleplayIntimacyBoundaryMode = 'normal' | 'slow_down' | 'firm_boundary';

export type RoleplayIntimacyPolicy = {
  explicitness: RoleplaySexualExplicitness;
  tone: RoleplaySexualTone;
  userIntent: RoleplayUserSexualIntent;
  boundaryMode: RoleplayIntimacyBoundaryMode;
  allowDirectSexualLanguage: boolean;
  allowRawVulgarLanguage: boolean;
  directive: string;
  forbidden: string[];
};
