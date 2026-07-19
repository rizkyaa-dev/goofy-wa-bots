import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { UnauthorizedException } from '@nestjs/common';
import { DashboardAuthGuard } from '../src/dashboard-security/dashboard-auth.guard';
import { DashboardTokenService } from '../src/dashboard-security/dashboard-token.service';
import { AppEnv } from '../src/config/env.validation';

const config = (values: Partial<AppEnv>) => ({
  get: <K extends keyof AppEnv>(key: K) => values[key],
});

const context = (input: {
  headers?: Record<string, string | string[] | undefined>;
  method?: string;
  url?: string;
  query?: Record<string, string | string[] | undefined>;
}) => ({
  switchToHttp: () => ({
    getRequest: () => input,
  }),
});

describe('dashboard auth contract', () => {
  it('allows requests when dashboard auth is disabled', () => {
    const guard = new DashboardAuthGuard(new DashboardTokenService(config({ DASHBOARD_AUTH_ENABLED: false }) as never));

    assert.equal(guard.canActivate(context({ headers: {} }) as never), true);
  });

  it('accepts bearer token when auth is enabled', () => {
    const guard = new DashboardAuthGuard(
      new DashboardTokenService(
        config({
          DASHBOARD_AUTH_ENABLED: true,
          DASHBOARD_AUTH_TOKEN: 'secret',
        }) as never,
      ),
    );

    assert.equal(guard.canActivate(context({ headers: { authorization: 'Bearer secret' } }) as never), true);
  });

  it('accepts query token for first browser navigation', () => {
    const guard = new DashboardAuthGuard(
      new DashboardTokenService(
        config({
          DASHBOARD_AUTH_ENABLED: true,
          DASHBOARD_AUTH_TOKEN: 'secret',
        }) as never,
      ),
    );

    assert.equal(guard.canActivate(context({ headers: {}, query: { token: 'secret' } }) as never), true);
  });

  it('allows static dashboard assets while auth protects HTML/API routes', () => {
    const guard = new DashboardAuthGuard(
      new DashboardTokenService(
        config({
          DASHBOARD_AUTH_ENABLED: true,
          DASHBOARD_AUTH_TOKEN: 'secret',
        }) as never,
      ),
    );

    assert.equal(guard.canActivate(context({ headers: {}, method: 'GET', url: '/app.js' }) as never), true);
  });

  it('rejects missing token when auth is enabled', () => {
    const guard = new DashboardAuthGuard(
      new DashboardTokenService(
        config({
          DASHBOARD_AUTH_ENABLED: true,
          DASHBOARD_AUTH_TOKEN: 'secret',
        }) as never,
      ),
    );

    assert.throws(() => guard.canActivate(context({ headers: {}, method: 'GET', url: '/Dashboard' }) as never), UnauthorizedException);
  });
});
