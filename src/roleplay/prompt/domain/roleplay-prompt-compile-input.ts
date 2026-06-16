import { RoleplayMemory, RoleplayState } from '@prisma/client';
import { LlmMessage } from '../../../llm/domain/llm.types';
import { RoleplayAddressPlan } from '../../domain/roleplay-address-plan';
import { RoleplayCharacterProfile } from '../../domain/roleplay-character-profile';
import { RoleplayConversationPlan } from '../../domain/roleplay-conversation-plan';
import { RoleplayEmotionAnalysis } from '../../domain/roleplay-emotion-analysis';
import { RoleplayProsodyPlan } from '../../domain/roleplay-prosody-plan';
import { RoleplayResponsePlan } from '../../domain/roleplay-response-plan';
import { RoleplayTimeContext } from '../../domain/roleplay-time-context';
import { QuoteDecision } from '../../quote/domain/quote-decision';

export type ConversationScope = 'personal_chat' | 'group_chat';

export type CompileInput = {
  profile: RoleplayCharacterProfile;
  state: RoleplayState;
  time: RoleplayTimeContext;
  memories: RoleplayMemory[];
  latestUserTurn: string;
  recentMessages: LlmMessage[];
  addressPlan: RoleplayAddressPlan;
  conversationPlan: RoleplayConversationPlan;
  prosodyPlan: RoleplayProsodyPlan;
  analysis: RoleplayEmotionAnalysis;
  conversationScope: ConversationScope;
  responsePlan: RoleplayResponsePlan;
  expertPrompt: string[];
  quoteDecision?: QuoteDecision;
  quoteTargetText?: string;
};
