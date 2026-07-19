import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { AppEnv } from '../config/env.validation';

@Injectable()
export class DashboardTokenService {
  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  isEnabled(): boolean {
    return this.config.get('DASHBOARD_AUTH_ENABLED');
  }

  isValidToken(candidate: string | undefined): boolean {
    if (!this.isEnabled()) {
      return true;
    }

    const expected = this.config.get('DASHBOARD_AUTH_TOKEN').trim();
    const provided = candidate?.trim() ?? '';

    if (!expected || !provided) {
      return false;
    }

    const expectedBuffer = Buffer.from(expected);
    const providedBuffer = Buffer.from(provided);

    return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
  }
}
