export type RoleplayAddressMode = 'none' | 'nickname' | 'affectionate' | 'teasing_affectionate';

export type RoleplayAddressPlan = {
  mode: RoleplayAddressMode;
  preferredName?: string;
  preferredNickname?: string;
  affectionateAlias?: string;
  shouldMirrorUserRegister: boolean;
  avoidHybridNickname: boolean;
  directive: string;
};
