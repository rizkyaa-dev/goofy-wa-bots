import { Module } from '@nestjs/common';
import { DashboardAuthGuard } from './dashboard-auth.guard';
import { DashboardTokenService } from './dashboard-token.service';

@Module({
  providers: [DashboardAuthGuard, DashboardTokenService],
  exports: [DashboardAuthGuard, DashboardTokenService],
})
export class DashboardSecurityModule {}
