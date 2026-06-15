import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { SandboxPrismaService } from './sandbox-prisma.service';

@Global()
@Module({
  providers: [PrismaService, SandboxPrismaService],
  exports: [PrismaService, SandboxPrismaService],
})
export class PrismaModule {}
