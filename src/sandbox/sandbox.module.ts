import { Module } from '@nestjs/common';
import { SandboxController } from './sandbox.controller';
import { RoleplayModule } from '../roleplay/roleplay.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { LlmModule } from '../llm/llm.module';

@Module({
  imports: [
    RoleplayModule,
    ConversationsModule,
    LlmModule,
  ],
  controllers: [SandboxController],
})
export class SandboxModule {}
