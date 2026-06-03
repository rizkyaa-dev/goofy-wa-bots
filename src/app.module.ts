import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BotModule } from './bot/bot.module';
import { validateEnv } from './config/env.validation';
import { ContactsModule } from './contacts/contacts.module';
import { ConversationsModule } from './conversations/conversations.module';
import { PrismaModule } from './infra/prisma/prisma.module';
import { WhatsappModule } from './wa/whatsapp.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    ContactsModule,
    ConversationsModule,
    BotModule,
    WhatsappModule,
  ],
})
export class AppModule {}
