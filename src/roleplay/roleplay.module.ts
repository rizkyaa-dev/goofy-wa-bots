import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module';
import { LlmModule } from '../llm/llm.module';
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
import { MemoryQuoteOutputPromptBuilder } from './prompt/builders/memory-quote-output-prompt.builder';
import { ResponseStylePromptBuilder } from './prompt/builders/response-style-prompt.builder';
import { TimeContextPromptBuilder } from './prompt/builders/time-context-prompt.builder';
import { ExpertPromptRegistryService } from './prompt/expert-prompt-registry.service';
import { RoleplayPromptCompilerService } from './prompt/roleplay-prompt-compiler.service';
import { ConversationalProsodyPlannerService } from './prosody/conversational-prosody-planner.service';
import { QuoteCandidateRetrieverService } from './quote/quote-candidate-retriever.service';
import { QuoteDecisionService } from './quote/quote-decision.service';
import { QuotePolicyService } from './quote/quote-policy.service';
import { RoleplayReplyPostProcessorService } from './response/roleplay-reply-post-processor.service';
import { ResponseDirectorService } from './response/response-director.service';
import { ResponseValidatorService } from './validation/response-validator.service';
import { RoleplayChatService } from './roleplay-chat.service';
import { RoleplayResetService } from './state/roleplay-reset.service';
import { RoleplayRouterService } from './response/roleplay-router.service';
import { RoleplayStateRepository } from './state/roleplay-state.repository';
import { TimeContextService } from './context/time-context.service';
import { RoleplayPreAnalyzerService } from './analyzer/roleplay-pre-analyzer.service';

@Module({
  imports: [ConversationsModule, LlmModule],
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
    ResponseValidatorService,
    RoleplayResetService,
    RoleplayRouterService,
    RoleplayStateRepository,
    TimeContextService,
    RoleplayPreAnalyzerService,
  ],
  exports: [
    RoleplayChatService,
    RoleplayMemoryService,
    RoleplayResetService,
    RoleplayPreAnalyzerService,
    CharacterProfileService,
  ],
})
export class RoleplayModule {}
