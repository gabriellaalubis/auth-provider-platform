import { Controller, Get, Header, Query, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { HealthResponse } from '@app/contracts';
import { AppAService } from './app-a.service';
import { AppAuthService } from './auth/app-auth.service';

@Controller()
export class AppAController {
  constructor(
    private readonly appAService: AppAService,
    private readonly appAuthService: AppAuthService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  async home(
    @Req() request: Request,
    @Query('error') error: string | undefined,
    @Query('requestId') requestId: string | undefined,
  ): Promise<string> {
    const cookieName = this.config.getOrThrow<string>(
      'APP_A_LOCAL_SESSION_COOKIE_NAME',
    );
    const token = this.readCookie(request, cookieName);
    const auth = token
      ? await this.appAuthService.readLocalSession(token)
      : null;
    return this.appAService.renderHome(
      auth,
      error === 'login_failed' ? requestId : undefined,
    );
  }

  @Get('health')
  getHealth(): HealthResponse {
    return { status: 'ok', service: 'app-a' };
  }

  private readCookie(request: Request, name: string): string | undefined {
    const cookies: unknown = request.cookies;
    if (typeof cookies !== 'object' || cookies === null) return undefined;
    const value: unknown = (cookies as Record<string, unknown>)[name];
    return typeof value === 'string' ? value : undefined;
  }
}
