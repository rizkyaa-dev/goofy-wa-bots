import { RoleplayMemory, RoleplayPresenceState, RoleplayState } from '@prisma/client';
import { LlmMessage } from '../../../llm/domain/llm.types';
import { WebSearchBrief } from '../../../web-search/domain/web-search.types';
import { RoleplayAddressPlan } from '../../domain/roleplay-address-plan';
import { RoleplayCharacterProfile } from '../../domain/roleplay-character-profile';
import { RoleplayConversationPlan } from '../../domain/roleplay-conversation-plan';
import { RoleplayEmotionAnalysis } from '../../domain/roleplay-emotion-analysis';
import { RoleplayIntimacyPolicy } from '../../intimacy/domain/roleplay-intimacy-policy';
import { RoleplayProsodyPlan } from '../../domain/roleplay-prosody-plan';
import { RoleplayResponsePlan } from '../../domain/roleplay-response-plan';
import { RoleplayTimeContext } from '../../domain/roleplay-time-context';
import { QuoteDecision } from '../../quote/domain/quote-decision';

export type ConversationScope = 'personal_chat' | 'group_chat';

export type CompileInput = {
  profile: RoleplayCharacterProfile;
  state: RoleplayState;
  presence?: RoleplayPresenceState | null;
  webSearch?: WebSearchBrief | null;
  time: RoleplayTimeContext;
  memories: RoleplayMemory[];
  latestUserTurn: string;
  recentMessages: LlmMessage[];
  addressPlan: RoleplayAddressPlan;
  conversationPlan: RoleplayConversationPlan;
  intimacyPolicy: RoleplayIntimacyPolicy;
  prosodyPlan: RoleplayProsodyPlan;
  analysis: RoleplayEmotionAnalysis;
  conversationScope: ConversationScope;
  responsePlan: RoleplayResponsePlan;
  expertPrompt: string[];
  quoteDecision?: QuoteDecision;
  quoteTargetText?: string;
};
