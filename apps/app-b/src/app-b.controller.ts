import { Controller, Get, Header, Query, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { HealthResponse } from '@app/contracts';
import { AppBService } from './app-b.service';
import { AppAuthService } from './auth/app-auth.service';

@Controller()
export class AppBController {
  constructor(
    private readonly service: AppBService,
    private readonly auth: AppAuthService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  async home(
    @Req() request: Request,
    @Query('error') error?: string,
    @Query('requestId') requestId?: string,
  ): Promise<string> {
    const token = this.cookie(
      request,
      this.config.getOrThrow<string>('APP_B_LOCAL_SESSION_COOKIE_NAME'),
    );
    const session = token ? await this.auth.readLocalSession(token) : null;
    return this.service.renderHome(
      session,
      error === 'login_failed' ? requestId : undefined,
    );
  }

  @Get('health')
  getHealth(): HealthResponse {
    return { status: 'ok', service: 'app-b' };
  }

  private cookie(request: Request, name: string): string | undefined {
    const cookies: unknown = request.cookies;
    if (typeof cookies !== 'object' || cookies === null) return undefined;
    const value: unknown = (cookies as Record<string, unknown>)[name];
    return typeof value === 'string' ? value : undefined;
  }
}
