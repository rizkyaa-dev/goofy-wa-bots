import { Module } from '@nestjs/common';
import { MessageDeduplicatorService } from './message-deduplicator.service';

@Module({
  providers: [MessageDeduplicatorService],
  exports: [MessageDeduplicatorService],
})
export class MessagesModule {}
