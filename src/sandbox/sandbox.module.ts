import { Module } from '@nestjs/common';
import { SandboxController } from './sandbox.controller';
import { RoleplayModule } from '../roleplay/roleplay.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { LlmModule } from '../llm/llm.module';
import { DashboardSecurityModule } from '../dashboard-security/dashboard-security.module';
import { SandboxRepository } from './sandbox.repository';
import { SandboxUseCase } from './sandbox.use-case';

@Module({
  imports: [
    RoleplayModule,
    ConversationsModule,
    LlmModule,
    DashboardSecurityModule,
  ],
  controllers: [SandboxController],
  providers: [SandboxRepository, SandboxUseCase],
})
export class SandboxModule {}
