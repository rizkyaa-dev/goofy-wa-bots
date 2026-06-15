import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../infra/prisma/prisma.module';
import { WhatsappModule } from '../wa/whatsapp.module';
import { LlmModule } from '../llm/llm.module';
import { RoleplayModule } from '../roleplay/roleplay.module';
import { ProactivePromptCompilerService } from './proactive-prompt-compiler.service';
import { ProactiveSchedulerService } from './proactive-scheduler.service';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    WhatsappModule,
    LlmModule,
    RoleplayModule,
  ],
  providers: [
    ProactivePromptCompilerService,
    ProactiveSchedulerService,
  ],
  exports: [
    ProactiveSchedulerService,
  ],
})
export class ProactiveModule {}
