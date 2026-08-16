import {
  Controller,
  Get,
  HttpStatus,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { SessionService } from '../auth/session.service';
import { AuthorizationCodeService } from './authorization-code.service';
import { AuthorizeQueryDto } from './dto/authorize-query.dto';

@Controller('oauth')
export class OAuthController {
  constructor(
    private readonly configService: ConfigService,
    private readonly sessionService: SessionService,
    private readonly authorizationCodeService: AuthorizationCodeService,
  ) {}

  @Get('authorize')
  async authorize(
    @Query() query: AuthorizeQueryDto,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const token = this.readCentralSessionToken(request);
    if (!token) {
      throw new UnauthorizedException('Central session tidak valid');
    }

    const auth = await this.sessionService.getValidSession(token);
    if (!auth) {
      throw new UnauthorizedException('Central session tidak valid');
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
