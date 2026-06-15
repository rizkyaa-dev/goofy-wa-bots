import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const dashboardEnabled = process.env.DASHBOARD_ENABLED !== 'false';
  const port = process.env.DASHBOARD_PORT ? Number(process.env.DASHBOARD_PORT) : 3000;

  const logger = new Logger('Bootstrap');
  let app;

  if (dashboardEnabled) {
    app = await NestFactory.create(AppModule);
    await app.listen(port);
    logger.log(`Personal WhatsApp bot is starting. Scan the QR code when it appears.`);
    const appUrl = process.env.APP_URL ? process.env.APP_URL.replace(/\/$/, '') : `http://localhost:${port}`;
    logger.log(`Dashboard is running at ${appUrl}/Dashboard`);
  } else {
    app = await NestFactory.createApplicationContext(AppModule);
    logger.log('Personal WhatsApp bot is starting in standalone mode. Scan the QR code when it appears.');
  }

  const shutdown = async (signal: string) => {
    logger.log(`Received ${signal}. Closing application.`);
    await app.close();
    process.exit(0);
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

void bootstrap();
