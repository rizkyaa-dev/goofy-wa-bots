import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { WhatsappModule } from '../wa/whatsapp.module';

@Module({
  imports: [WhatsappModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
