import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

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
    await this.ensureSchema();
    await this.$connect();
  }

  private async ensureSchema(): Promise<void> {
    const prismaCli = join(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js');

    try {
      await execFileAsync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_URL: 'file:./sandbox.db',
        },
        windowsHide: true,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to initialize sandbox database schema: ${detail}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
