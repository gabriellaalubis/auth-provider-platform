import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { SessionService } from '../auth/session.service';
import { AuthorizationCodeService } from './authorization-code.service';
import { extractBearerToken } from './bearer-token';
import { AuthorizeQueryDto } from './dto/authorize-query.dto';
import { TokenRequestDto } from './dto/token-request.dto';
import { TokenExchangeService } from './token-exchange.service';
import { UserInfoService } from './userinfo.service';

@Controller('oauth')
export class OAuthController {
  constructor(
    private readonly configService: ConfigService,
    private readonly sessionService: SessionService,
    private readonly authorizationCodeService: AuthorizationCodeService,
    private readonly tokenExchangeService: TokenExchangeService,
    private readonly userInfoService: UserInfoService,
  ) {}

  @Get('authorize')
  async authorize(
    @Query() query: AuthorizeQueryDto,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const token = this.readCentralSessionToken(request);
    if (!token) {
      response.redirect(
        HttpStatus.FOUND,
        `/auth/login?return_to=${encodeURIComponent(request.originalUrl)}`,
      );
      return;
    }

    const auth = await this.sessionService.getValidSession(token);
    if (!auth) {
      response.redirect(
        HttpStatus.FOUND,
        `/auth/login?return_to=${encodeURIComponent(request.originalUrl)}`,
      );
      return;
    }

    const issued = await this.authorizationCodeService.issue({
      userId: auth.user.id,
      centralSessionId: auth.session.id,
      clientId: query.client_id,
      redirectUri: query.redirect_uri,
      state: query.state,
      codeChallenge: query.code_challenge,
    });

    const redirectUrl = new URL(issued.redirectUri);
    redirectUrl.searchParams.set('code', issued.code);
    redirectUrl.searchParams.set('state', issued.state);
    response.redirect(HttpStatus.FOUND, redirectUrl.toString());
  }

  @Post('token')
  @HttpCode(HttpStatus.OK)
  exchange(@Body() dto: TokenRequestDto) {
    return this.tokenExchangeService.exchange(dto);
  }

  @Get('userinfo')
  userinfo(@Headers('authorization') authorization: string | undefined) {
    const token = extractBearerToken(authorization);
    return this.userInfoService.getProfile(token);
  }

  private readCentralSessionToken(request: Request): string | undefined {
    const cookies: unknown = request.cookies;
    if (typeof cookies !== 'object' || cookies === null) {
      return undefined;
    }

    const cookieName = this.configService.getOrThrow<string>(
      'SESSION_COOKIE_NAME',
    );
    const token: unknown = (cookies as Record<string, unknown>)[cookieName];
    return typeof token === 'string' ? token : undefined;
  }
}
