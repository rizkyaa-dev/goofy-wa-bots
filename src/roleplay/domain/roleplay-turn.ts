import { ContactSetting, RoleplayMemory, RoleplayPresenceState, RoleplayState } from '@prisma/client';
import { BotReply } from '../../bot/domain/bot-reply';
import { LlmMessage } from '../../llm/domain/llm.types';
import { IncomingMessage } from '../../messages/domain/incoming-message';
import { WebSearchBrief } from '../../web-search/domain/web-search.types';
import { RoleplayAddressPlan } from './roleplay-address-plan';
import { RoleplayCharacterProfile } from './roleplay-character-profile';
import { RoleplayConversationPlan } from './roleplay-conversation-plan';
import { RoleplayEmotionAnalysis } from './roleplay-emotion-analysis';
import { RoleplayProsodyPlan } from './roleplay-prosody-plan';
import { RoleplayResponsePlan } from './roleplay-response-plan';
import { RoleplayRouteDecision } from './roleplay-route';
import { RoleplayTimeContext } from './roleplay-time-context';
import { RoleplayIntimacyPolicy } from '../intimacy/domain/roleplay-intimacy-policy';
import { QuoteCandidate } from '../quote/domain/quote-candidate';
import { QuoteDecision } from '../quote/domain/quote-decision';

export type ConversationScope = 'personal_chat' | 'group_chat';

export type RoleplayTurnInput = {
  message: IncomingMessage;
  settings: ContactSetting;
};

export type RoleplayTurnContext = RoleplayTurnInput & {
  previousState: RoleplayState;
  recentMessages: LlmMessage[];
  conversationScope: ConversationScope;
};

export type RoleplayMemoryBundle = {
  memories: RoleplayMemory[];
  quoteCandidates: QuoteCandidate[];
};

export type RoleplayTurnAnalysis = {
  emotion: RoleplayEmotionAnalysis;
  route: RoleplayRouteDecision;
  quote: QuoteDecision;
  webSearch: WebSearchBrief | null;
};

export type RoleplayPlanningBundle = {
  profile: RoleplayCharacterProfile;
  state: RoleplayState;
  presence: RoleplayPresenceState | null;
  time: RoleplayTimeContext;
  memories: RoleplayMemory[];
  quoteDecision: QuoteDecision;
  quoteTargetText?: string;
  conversationPlan: RoleplayConversationPlan;
  addressPlan: RoleplayAddressPlan;
  responsePlan: RoleplayResponsePlan;
  prosodyPlan: RoleplayProsodyPlan;
  intimacyPolicy: RoleplayIntimacyPolicy;
};

export type RoleplayReplyResult = BotReply;
