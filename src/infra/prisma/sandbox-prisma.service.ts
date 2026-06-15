import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { join } from 'path';
import { copyFile, access } from 'fs/promises';

@Injectable()
export class SandboxPrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      datasources: {
        db: {
          url: 'file:./sandbox.db',
        },
      },
    });
  }

  async onModuleInit(): Promise<void> {
    const sandboxDbPath = join(process.cwd(), 'prisma', 'sandbox.db');
    const devDbPath = join(process.cwd(), 'prisma', 'dev.db');
    try {
      await access(sandboxDbPath);
    } catch {
      try {
        await copyFile(devDbPath, sandboxDbPath);
        console.log('Sandbox database created successfully by copying dev.db');
      } catch (err) {
        console.error('Failed to copy dev.db to sandbox.db', err);
      }
    }
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
