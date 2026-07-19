import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { DashboardTokenService } from './dashboard-token.service';

@Injectable()
export class DashboardAuthGuard implements CanActivate {
  constructor(private readonly tokens: DashboardTokenService) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.tokens.isEnabled()) {
      return true;
    }

    const request = context.switchToHttp().getRequest<DashboardRequest>();
    if (this.isPublicAssetRequest(request)) {
      return true;
    }

    const token = this.readToken(request);

    if (this.tokens.isValidToken(token)) {
      return true;
    }

    throw new UnauthorizedException('Dashboard authentication required.');
  }

  private readToken(request: DashboardRequest): string | undefined {
    const authorization = request.headers?.authorization;
    if (authorization?.toLowerCase().startsWith('bearer ')) {
      return authorization.slice('bearer '.length);
    }

    const headerToken = request.headers?.['x-dashboard-token'];
    if (headerToken) {
      return Array.isArray(headerToken) ? headerToken[0] : headerToken;
    }

    const queryToken = request.query?.token;
    return Array.isArray(queryToken) ? queryToken[0] : queryToken;
  }

  private isPublicAssetRequest(request: DashboardRequest): boolean {
    if (request.method !== 'GET') {
      return false;
    }

    const path = request.url?.split('?')[0] ?? '';
    return path === '/style.css' || path === '/app.js' || path === '/sandbox.js';
  }
}

type DashboardRequest = {
  method?: string;
  url?: string;
  headers?: {
    authorization?: string;
    'x-dashboard-token'?: string | string[];
  };
  query?: {
    token?: string | string[];
  };
};
