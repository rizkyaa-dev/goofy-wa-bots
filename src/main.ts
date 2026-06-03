import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);

  const logger = new Logger('Bootstrap');
  logger.log('Personal WhatsApp bot is starting. Scan the QR code when it appears.');

  const shutdown = async (signal: string) => {
    logger.log(`Received ${signal}. Closing application.`);
    await app.close();
    process.exit(0);
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

void bootstrap();
