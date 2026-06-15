import { Module } from '@nestjs/common';
import { SandboxController } from './sandbox.controller';
import { RoleplayModule } from '../roleplay/roleplay.module';
import { ConversationsModule } from '../conversations/conversations.module';

@Module({
  imports: [
    RoleplayModule,
    ConversationsModule,
  ],
  controllers: [SandboxController],
})
export class SandboxModule {}
