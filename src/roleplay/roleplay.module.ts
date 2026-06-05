import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module';
import { LlmModule } from '../llm/llm.module';
import { CharacterProfileService } from './character-profile.service';
import { ContinuityGuardService } from './continuity-guard.service';
import { RecentMessageContextService } from './context/recent-message-context.service';
import { RoleplayContextMessageFilterService } from './context/roleplay-context-message-filter.service';
import { EmotionClassifierService } from './emotion-classifier.service';
import { EmotionEngineService } from './emotion-engine.service';
import { RoleplayMemoryExtractorService } from './memory/roleplay-memory-extractor.service';
import { RoleplayMemoryService } from './memory/roleplay-memory.service';
import { RoleplayMemoryTriggerService } from './memory/roleplay-memory-trigger.service';
import { RoleplayMemoryValidatorService } from './memory/roleplay-memory-validator.service';
import { RoleplayPromptCompilerService } from './prompt/roleplay-prompt-compiler.service';
import { QuoteCandidateRetrieverService } from './quote/quote-candidate-retriever.service';
import { QuoteDecisionService } from './quote/quote-decision.service';
import { QuotePolicyService } from './quote/quote-policy.service';
import { ResponseDirectorService } from './response-director.service';
import { ResponseValidatorService } from './response-validator.service';
import { RoleplayChatService } from './roleplay-chat.service';
import { RoleplayResetService } from './roleplay-reset.service';
import { RoleplayStateRepository } from './roleplay-state.repository';
import { TimeContextService } from './time-context.service';

@Module({
  imports: [ConversationsModule, LlmModule],
  providers: [
    CharacterProfileService,
    ContinuityGuardService,
    EmotionClassifierService,
    EmotionEngineService,
    RecentMessageContextService,
    RoleplayContextMessageFilterService,
    RoleplayMemoryExtractorService,
    RoleplayChatService,
    RoleplayMemoryService,
    RoleplayMemoryTriggerService,
    RoleplayMemoryValidatorService,
    RoleplayPromptCompilerService,
    QuoteCandidateRetrieverService,
    QuoteDecisionService,
    QuotePolicyService,
    ResponseDirectorService,
    ResponseValidatorService,
    RoleplayResetService,
    RoleplayStateRepository,
    TimeContextService,
  ],
  exports: [RoleplayChatService, RoleplayMemoryService, RoleplayResetService],
})
export class RoleplayModule {}
