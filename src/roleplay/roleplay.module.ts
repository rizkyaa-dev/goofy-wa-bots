import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module';
import { LlmModule } from '../llm/llm.module';
import { CharacterProfileService } from './character-profile.service';
import { RecentMessageContextService } from './context/recent-message-context.service';
import { EmotionClassifierService } from './emotion-classifier.service';
import { EmotionEngineService } from './emotion-engine.service';
import { RoleplayMemoryService } from './memory/roleplay-memory.service';
import { RoleplayPromptCompilerService } from './prompt/roleplay-prompt-compiler.service';
import { RoleplayChatService } from './roleplay-chat.service';
import { RoleplayResetService } from './roleplay-reset.service';
import { RoleplayStateRepository } from './roleplay-state.repository';
import { TimeContextService } from './time-context.service';

@Module({
  imports: [ConversationsModule, LlmModule],
  providers: [
    CharacterProfileService,
    EmotionClassifierService,
    EmotionEngineService,
    RecentMessageContextService,
    RoleplayChatService,
    RoleplayMemoryService,
    RoleplayPromptCompilerService,
    RoleplayResetService,
    RoleplayStateRepository,
    TimeContextService,
  ],
  exports: [RoleplayChatService, RoleplayResetService],
})
export class RoleplayModule {}
