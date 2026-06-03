import { Module } from '@nestjs/common';
import { ContactsModule } from '../contacts/contacts.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { LlmModule } from '../llm/llm.module';
import { MessagesModule } from '../messages/messages.module';
import { BotOrchestratorService } from './bot-orchestrator.service';
import { CommandRegistryService } from './command-registry.service';
import { AiCommand } from './commands/ai.command';
import { HelpCommand } from './commands/help.command';
import { ModeCommand } from './commands/mode.command';
import { ModelCommand } from './commands/model.command';
import { NoteCommand } from './commands/note.command';
import { NotesCommand } from './commands/notes.command';
import { PersonaCommand } from './commands/persona.command';
import { PingCommand } from './commands/ping.command';
import { ProviderCommand } from './commands/provider.command';
import { CommandHandler } from './domain/command-handler';
import { TemporaryGreetingReplyService } from './temporary-greeting-reply.service';
import { COMMAND_HANDLERS } from './tokens';

const commandProviders = [
  PingCommand,
  ModeCommand,
  NoteCommand,
  NotesCommand,
  PersonaCommand,
  AiCommand,
  ProviderCommand,
  ModelCommand,
  HelpCommand,
];

@Module({
  imports: [ContactsModule, ConversationsModule, MessagesModule, LlmModule],
  providers: [
    ...commandProviders,
    {
      provide: COMMAND_HANDLERS,
      useFactory: (...handlers: CommandHandler[]) => handlers,
      inject: commandProviders,
    },
    CommandRegistryService,
    TemporaryGreetingReplyService,
    BotOrchestratorService,
  ],
  exports: [BotOrchestratorService],
})
export class BotModule {}
