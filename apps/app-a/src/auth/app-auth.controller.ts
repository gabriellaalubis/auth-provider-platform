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
import { AppAuthService, type LocalSessionView } from './app-auth.service';

@Controller()
export class AppAuthController {
  constructor(
    private readonly appAuth: AppAuthService,
    private readonly config: ConfigService,
  ) {}

  @Get('login')
  async login(@Res() response: Response): Promise<void> {
    const started = await this.appAuth.beginLogin();
    response.cookie('app_a_oauth_attempt', started.attemptId, {
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
    const attemptId = this.readCookie(request, 'app_a_oauth_attempt');
    if (!attemptId || !code || !state) {
      throw new UnauthorizedException(
        'Proses login tidak valid atau sudah kedaluwarsa',
      );
    }
    const localToken = await this.appAuth.completeCallback(
      attemptId,
      code,
      state,
    );
    response.clearCookie('app_a_oauth_attempt', { path: '/callback' });
    response.cookie(
      this.config.getOrThrow<string>('APP_A_LOCAL_SESSION_COOKIE_NAME'),
      localToken,
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
      this.config.getOrThrow<string>('APP_A_LOCAL_SESSION_COOKIE_NAME'),
    );
    const session = token ? await this.appAuth.readLocalSession(token) : null;
    if (!session) throw new UnauthorizedException('Local session tidak valid');
    return session;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const cookieName = this.config.getOrThrow<string>(
      'APP_A_LOCAL_SESSION_COOKIE_NAME',
    );
    await this.appAuth.revokeLocalSession(this.readCookie(request, cookieName));
    response.clearCookie(cookieName, { path: '/' });
    response.status(HttpStatus.NO_CONTENT).send();
  }

  private readCookie(request: Request, name: string): string | undefined {
    const cookies: unknown = request.cookies;
    if (typeof cookies !== 'object' || cookies === null) return undefined;
    const value: unknown = (cookies as Record<string, unknown>)[name];
    return typeof value === 'string' ? value : undefined;
  }
}
