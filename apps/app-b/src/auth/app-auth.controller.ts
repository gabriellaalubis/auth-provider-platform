import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { AppAuthService, type LocalSessionView } from './app-auth.service';

@Controller()
export class AppAuthController {
  constructor(
    private readonly auth: AppAuthService,
    private readonly config: ConfigService,
  ) {}

  @Get('login')
  async login(@Res() response: Response): Promise<void> {
    const started = await this.auth.beginLogin();
    response.cookie('app_b_oauth_attempt', started.attemptId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.getOrThrow<boolean>('SESSION_COOKIE_SECURE'),
      path: '/callback',
      maxAge:
        this.config.getOrThrow<number>('OAUTH_LOGIN_ATTEMPT_TTL_SECONDS') *
        1000,
    });
    response.redirect(started.authorizeUrl);
  }

  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const attemptId = this.readCookie(request, 'app_b_oauth_attempt');
    if (!attemptId || !code || !state) {
      throw new UnauthorizedException('The sign-in request is invalid');
    }
    let token: string;
    try {
      token = await this.auth.completeCallback(attemptId, code, state);
    } catch {
      response.clearCookie('app_b_oauth_attempt', { path: '/callback' });
      response.redirect(
        `/?error=login_failed&requestId=${encodeURIComponent(randomUUID())}`,
      );
      return;
    }
    response.clearCookie('app_b_oauth_attempt', { path: '/callback' });
    response.cookie(
      this.config.getOrThrow<string>('APP_B_LOCAL_SESSION_COOKIE_NAME'),
      token,
      {
        httpOnly: true,
        sameSite: 'lax',
        secure: this.config.getOrThrow<boolean>('SESSION_COOKIE_SECURE'),
        path: '/',
        maxAge:
          this.config.getOrThrow<number>('LOCAL_SESSION_TTL_SECONDS') * 1000,
      },
    );
    response.redirect('/');
  }

  @Get('api/session')
  async session(@Req() request: Request): Promise<LocalSessionView> {
    const token = this.readCookie(
      request,
      this.config.getOrThrow<string>('APP_B_LOCAL_SESSION_COOKIE_NAME'),
    );
    const session = token ? await this.auth.readLocalSession(token) : null;
    if (!session) throw new UnauthorizedException('Local session is invalid');
    return session;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const name = this.config.getOrThrow<string>(
      'APP_B_LOCAL_SESSION_COOKIE_NAME',
    );
    await this.auth.revokeLocalSession(this.readCookie(request, name));
    response.clearCookie(name, { path: '/' });
    response.status(HttpStatus.NO_CONTENT).send();
  }

  private readCookie(request: Request, name: string): string | undefined {
    const cookies: unknown = request.cookies;
    if (typeof cookies !== 'object' || cookies === null) return undefined;
    const value: unknown = (cookies as Record<string, unknown>)[name];
    return typeof value === 'string' ? value : undefined;
  }
}
