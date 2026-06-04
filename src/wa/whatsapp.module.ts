import { Module } from '@nestjs/common';
import { BotModule } from '../bot/bot.module';
import { BrowserExecutableResolverService } from './browser-executable-resolver.service';
import { WhatsappMessageNormalizerService } from './whatsapp-message-normalizer.service';
import { WhatsappReplyBatcherService } from './whatsapp-reply-batcher.service';
import { WhatsappTypingSimulatorService } from './whatsapp-typing-simulator.service';
import { WhatsappWebClientService } from './whatsapp-web-client.service';

@Module({
  imports: [BotModule],
  providers: [
    BrowserExecutableResolverService,
    WhatsappMessageNormalizerService,
    WhatsappReplyBatcherService,
    WhatsappTypingSimulatorService,
    WhatsappWebClientService,
  ],
})
export class WhatsappModule {}
