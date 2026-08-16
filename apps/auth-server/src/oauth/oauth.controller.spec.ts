import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { SessionService } from '../auth/session.service';
import { AuthorizationCodeService } from './authorization-code.service';
import { OAuthController } from './oauth.controller';
import { TokenExchangeService } from './token-exchange.service';
import { UserInfoService } from './userinfo.service';

describe('OAuthController', () => {
  const configService = { getOrThrow: jest.fn() };
  const sessionService = { getValidSession: jest.fn() };
  const authorizationCodeService = { issue: jest.fn() };
  const tokenExchangeService = { exchange: jest.fn() };
  const userInfoService = { getProfile: jest.fn() };
  let controller: OAuthController;

  beforeEach(() => {
    jest.clearAllMocks();
    configService.getOrThrow.mockReturnValue('central_session');
    controller = new OAuthController(
      configService as unknown as ConfigService,
      sessionService as unknown as SessionService,
      authorizationCodeService as unknown as AuthorizationCodeService,
      tokenExchangeService as unknown as TokenExchangeService,
      userInfoService as unknown as UserInfoService,
    );
  });

  it('menolak authorize ketika central cookie tidak tersedia', async () => {
    const request = { cookies: {} } as Request;
    const response = { redirect: jest.fn() } as unknown as Response;

    await expect(
      controller.authorize(
        {
          response_type: 'code',
          client_id: 'app-a',
          redirect_uri: 'http://localhost:4001/callback',
          state: 'state-yang-panjang-dan-acak-123456',
          code_challenge: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ',
          code_challenge_method: 'S256',
        },
        request,
        response,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('melakukan redirect dengan code dan state setelah authorize sukses', async () => {
    const request = {
      cookies: { central_session: 'central-token' },
    } as Request;
    let redirectedLocation = '';
    const redirect = jest.fn((_status: number, location: string) => {
      redirectedLocation = location;
    });
    const response = { redirect } as unknown as Response;
    sessionService.getValidSession.mockResolvedValue({
      user: { id: '11111111-1111-4111-8111-111111111111' },
      session: { id: '22222222-2222-4222-8222-222222222222' },
    });
    authorizationCodeService.issue.mockResolvedValue({
      code: 'authorization-code',
      redirectUri: 'http://localhost:4001/callback',
      state: 'state-yang-panjang-dan-acak-123456',
    });

    await controller.authorize(
      {
        response_type: 'code',
        client_id: 'app-a',
        redirect_uri: 'http://localhost:4001/callback',
        state: 'state-yang-panjang-dan-acak-123456',
        code_challenge: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ',
        code_challenge_method: 'S256',
      },
      request,
      response,
    );

    expect(redirect).toHaveBeenCalledTimes(1);
    const url = new URL(redirectedLocation);
    expect(url.origin + url.pathname).toBe('http://localhost:4001/callback');
    expect(url.searchParams.get('code')).toBe('authorization-code');
    expect(url.searchParams.get('state')).toBe(
      'state-yang-panjang-dan-acak-123456',
    );
  });
});
