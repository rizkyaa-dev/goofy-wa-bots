export type RoleplayContinuityDisclosure = {
  topic: 'user_current_activity';
  value: string;
};

export type RoleplayContinuityContext = {
  disclosures: RoleplayContinuityDisclosure[];
  answeredTopics: string[];
  blockedFollowUpTopics: string[];
  callbackHints: string[];
};
