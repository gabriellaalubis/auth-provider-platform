import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthResponse } from '@app/contracts';
import type { CookieOptions, Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SessionService } from './session.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
    private readonly configService: ConfigService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const result = await this.authService.login(dto);
    response.cookie(this.cookieName, result.token, this.cookieOptions(true));
    return result.auth;
  }

  @Get('session')
  async session(@Req() request: Request): Promise<AuthResponse> {
    const token = this.readToken(request);
    if (!token) {
      throw new UnauthorizedException('Session tidak tersedia');
    }

    const auth = await this.sessionService.getValidSession(token);
    if (!auth) {
      throw new UnauthorizedException('Session tidak valid');
    }

    return auth;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const token = this.readToken(request);
    if (token) {
      await this.sessionService.revoke(token);
    }
    response.clearCookie(this.cookieName, this.cookieOptions(false));
  }

  private get cookieName(): string {
    return this.configService.getOrThrow<string>('SESSION_COOKIE_NAME');
  }

  private cookieOptions(includeMaxAge: boolean): CookieOptions {
    const options: CookieOptions = {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.configService.getOrThrow<boolean>('SESSION_COOKIE_SECURE'),
      path: '/',
    };

    if (includeMaxAge) {
      options.maxAge =
        this.configService.getOrThrow<number>('SESSION_TTL_SECONDS') * 1000;
    }

    return options;
  }

  private readToken(request: Request): string | undefined {
    const cookies: unknown = request.cookies;
    if (typeof cookies !== 'object' || cookies === null) {
      return undefined;
    }

    const token: unknown = (cookies as Record<string, unknown>)[
      this.cookieName
    ];
    return typeof token === 'string' ? token : undefined;
  }
}
