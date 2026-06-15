import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module';
import { LlmModule } from '../llm/llm.module';
import { CharacterProfileService } from './character-profile.service';
import { ContinuityGuardService } from './continuity-guard.service';
import { RoleplayAddressPlannerService } from './address/roleplay-address-planner.service';
import { ConversationBuilderService } from './conversation/conversation-builder.service';
import { RecentMessageContextService } from './context/recent-message-context.service';
import { RoleplayContextMessageFilterService } from './context/roleplay-context-message-filter.service';
import { EmotionClassifierService } from './emotion-classifier.service';
import { EmotionEngineService } from './emotion-engine.service';
import { RoleplayIdentityQuestionDetectorService } from './identity/roleplay-identity-question-detector.service';
import { RoleplayMemoryExtractorService } from './memory/roleplay-memory-extractor.service';
import { RoleplayMemoryService } from './memory/roleplay-memory.service';
import { RoleplayMemoryTriggerService } from './memory/roleplay-memory-trigger.service';
import { RoleplayMemoryValidatorService } from './memory/roleplay-memory-validator.service';
import { ExpertPromptRegistryService } from './prompt/expert-prompt-registry.service';
import { RoleplayPromptCompilerService } from './prompt/roleplay-prompt-compiler.service';
import { ConversationalProsodyPlannerService } from './prosody/conversational-prosody-planner.service';
import { QuoteCandidateRetrieverService } from './quote/quote-candidate-retriever.service';
import { QuoteDecisionService } from './quote/quote-decision.service';
import { QuotePolicyService } from './quote/quote-policy.service';
import { ResponseDirectorService } from './response-director.service';
import { ResponseValidatorService } from './response-validator.service';
import { RoleplayChatService } from './roleplay-chat.service';
import { RoleplayResetService } from './roleplay-reset.service';
import { RoleplayRouterService } from './roleplay-router.service';
import { RoleplayStateRepository } from './roleplay-state.repository';
import { TimeContextService } from './time-context.service';
import { RoleplayPreAnalyzerService } from './roleplay-pre-analyzer.service';

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
    ExpertPromptRegistryService,
    RoleplayPromptCompilerService,
    ConversationalProsodyPlannerService,
    QuoteCandidateRetrieverService,
    QuoteDecisionService,
    QuotePolicyService,
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
