import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module';
import { LlmModule } from '../llm/llm.module';
import { WebSearchModule } from '../web-search/web-search.module';
import { CharacterProfileService } from './identity/character-profile.service';
import { ContinuityGuardService } from './validation/continuity-guard.service';
import { RoleplayAddressPlannerService } from './address/roleplay-address-planner.service';
import { ConversationBuilderService } from './conversation/conversation-builder.service';
import { RecentMessageContextService } from './context/recent-message-context.service';
import { RoleplayContextMessageFilterService } from './context/roleplay-context-message-filter.service';
import { EmotionClassifierService } from './emotion/emotion-classifier.service';
import { EmotionEngineService } from './emotion/emotion-engine.service';
import { RoleplayIdentityQuestionDetectorService } from './identity/roleplay-identity-question-detector.service';
import { RoleplayMemoryExtractorService } from './memory/roleplay-memory-extractor.service';
import { RoleplayMemoryService } from './memory/roleplay-memory.service';
import { RoleplayMemoryTriggerService } from './memory/roleplay-memory-trigger.service';
import { RoleplayMemoryValidatorService } from './memory/roleplay-memory-validator.service';
import { CharacterFoundationPromptBuilder } from './prompt/builders/character-foundation-prompt.builder';
import { ConversationContextPromptBuilder } from './prompt/builders/conversation-context-prompt.builder';
import { EmotionStatePromptBuilder } from './prompt/builders/emotion-state-prompt.builder';
import { IntimacyPolicyPromptBuilder } from './prompt/builders/intimacy-policy-prompt.builder';
import { MemoryQuoteOutputPromptBuilder } from './prompt/builders/memory-quote-output-prompt.builder';
import { PresenceContextPromptBuilder } from './prompt/builders/presence-context-prompt.builder';
import { ResponseStylePromptBuilder } from './prompt/builders/response-style-prompt.builder';
import { TimeContextPromptBuilder } from './prompt/builders/time-context-prompt.builder';
import { WebSearchContextPromptBuilder } from './prompt/builders/web-search-context-prompt.builder';
import { RoleplayPresenceAgentService } from './presence/roleplay-presence-agent.service';
import { RoleplayPresenceDirectorService } from './presence/roleplay-presence-director.service';
import { RoleplayPresenceEmotionPolicyService } from './presence/roleplay-presence-emotion-policy.service';
import { RoleplayPresenceSchedulerService } from './presence/roleplay-presence-scheduler.service';
import { RoleplayPresenceService } from './presence/roleplay-presence.service';
import { RoleplayPresenceStateRepository } from './presence/roleplay-presence-state.repository';
import { RoleplayIntimacyPolicyService } from './intimacy/roleplay-intimacy-policy.service';
import { ExpertPromptRegistryService } from './prompt/expert-prompt-registry.service';
import { RoleplayPromptCompilerService } from './prompt/roleplay-prompt-compiler.service';
import { ConversationalProsodyPlannerService } from './prosody/conversational-prosody-planner.service';
import { QuoteCandidateRetrieverService } from './quote/quote-candidate-retriever.service';
import { QuoteDecisionService } from './quote/quote-decision.service';
import { QuotePolicyService } from './quote/quote-policy.service';
import { RoleplayReplyPostProcessorService } from './response/roleplay-reply-post-processor.service';
import { ResponseDirectorService } from './response/response-director.service';
import { InternalDisclosureGuardService } from './validation/internal-disclosure-guard.service';
import { ResponseValidatorService } from './validation/response-validator.service';
import { RoleplayChatService } from './roleplay-chat.service';
import { RoleplayResetService } from './state/roleplay-reset.service';
import { RoleplayRouterService } from './response/roleplay-router.service';
import { RoleplayStateRepository } from './state/roleplay-state.repository';
import { TimeContextService } from './context/time-context.service';
import { RoleplayPreAnalyzerService } from './analyzer/roleplay-pre-analyzer.service';
import { FreshDataDetectorService } from './search/fresh-data-detector.service';
import { SearchIntentClassifierService } from './search/search-intent-classifier.service';

@Module({
  imports: [ConversationsModule, LlmModule, WebSearchModule],
  providers: [
    CharacterProfileService,
    ContinuityGuardService,
    RoleplayAddressPlannerService,
    ConversationBuilderService,
    EmotionClassifierService,
    EmotionEngineService,
    RecentMessageContextService,
    RoleplayContextMessageFilterService,
    RoleplayIdentityQuestionDetectorService,
    RoleplayMemoryExtractorService,
    RoleplayChatService,
    RoleplayMemoryService,
    RoleplayMemoryTriggerService,
    RoleplayMemoryValidatorService,
    CharacterFoundationPromptBuilder,
    EmotionStatePromptBuilder,
    IntimacyPolicyPromptBuilder,
    PresenceContextPromptBuilder,
    WebSearchContextPromptBuilder,
    TimeContextPromptBuilder,
    ConversationContextPromptBuilder,
    ResponseStylePromptBuilder,
    MemoryQuoteOutputPromptBuilder,
    ExpertPromptRegistryService,
    RoleplayPromptCompilerService,
    ConversationalProsodyPlannerService,
    QuoteCandidateRetrieverService,
    QuoteDecisionService,
    QuotePolicyService,
    RoleplayReplyPostProcessorService,
    ResponseDirectorService,
    InternalDisclosureGuardService,
    ResponseValidatorService,
    RoleplayResetService,
    RoleplayRouterService,
    RoleplayStateRepository,
    RoleplayPresenceAgentService,
    RoleplayPresenceDirectorService,
    RoleplayPresenceEmotionPolicyService,
    RoleplayPresenceSchedulerService,
    RoleplayPresenceService,
    RoleplayPresenceStateRepository,
    RoleplayIntimacyPolicyService,
    TimeContextService,
    RoleplayPreAnalyzerService,
    FreshDataDetectorService,
    SearchIntentClassifierService,
  ],
  exports: [
    RoleplayChatService,
    RoleplayMemoryService,
    RoleplayResetService,
    RoleplayPreAnalyzerService,
    RoleplayPresenceService,
    CharacterProfileService,
    InternalDisclosureGuardService,
  ],
})
export class RoleplayModule {}
