import { Controller, Get, Header, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { HealthResponse } from '@app/contracts';
import type { Request } from 'express';
import { AppService } from './app.service';
import { SessionService } from './auth/session.service';
import type { Response } from 'express';
import {
  HealthService,
  type LivenessResponse,
  type ReadinessResponse,
} from './health/health.service';
import { MfaService } from './auth/mfa.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly sessionService: SessionService,
    private readonly configService: ConfigService,
    private readonly healthService: HealthService,
    private readonly mfaService: MfaService,
  ) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  async home(@Req() request: Request): Promise<string> {
    const cookieName = this.configService.getOrThrow<string>(
      'SESSION_COOKIE_NAME',
    );
    const cookies: unknown = request.cookies;
    const token =
      typeof cookies === 'object' && cookies !== null
        ? (cookies as Record<string, unknown>)[cookieName]
        : undefined;
    const auth =
      typeof token === 'string'
        ? await this.sessionService.getValidSession(token)
        : null;
    const mfaStatus = auth
      ? await this.mfaService.getStatus(auth.user.id)
      : undefined;
    return this.appService.renderHome(auth, mfaStatus);
  }

  @Get('health')
  getHealth(): HealthResponse {
    return { status: 'ok', service: 'auth-server' };
  }

  @Get('health/live')
  getLiveness(): LivenessResponse {
    return this.healthService.getLiveness();
  }

  @Get('health/ready')
  async getReadiness(
    @Res({ passthrough: true }) response: Response,
  ): Promise<ReadinessResponse> {
    const readiness = await this.healthService.getReadiness();
    response.status(readiness.status === 'ready' ? 200 : 503);
    return readiness;
  }
}
