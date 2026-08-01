import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardRepository } from './dashboard.repository';
import { DashboardService } from './dashboard.service';
import { WhatsappModule } from '../wa/whatsapp.module';
import { DashboardSecurityModule } from '../dashboard-security/dashboard-security.module';
import { RoleplayModule } from '../roleplay/roleplay.module';

@Module({
  imports: [WhatsappModule, DashboardSecurityModule, RoleplayModule],
  controllers: [DashboardController],
  providers: [DashboardRepository, DashboardService],
})
export class DashboardModule {}
