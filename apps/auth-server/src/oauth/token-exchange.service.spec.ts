import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthPrismaService } from '@app/auth-database';
import { PasswordService } from '@app/security';
import { TokenExchangeService } from './token-exchange.service';

describe('TokenExchangeService', () => {
  const now = Date.now();
  const authorizationCode = {
    id: '11111111-1111-4111-8111-111111111111',
    codeHash: 'code-hash',
    userId: '22222222-2222-4222-8222-222222222222',
    applicationId: '33333333-3333-4333-8333-333333333333',
    centralSessionId: '44444444-4444-4444-8444-444444444444',
    redirectUri: 'http://localhost:4001/callback',
    codeChallenge: 'expected-challenge',
    codeChallengeMethod: 'S256',
    status: 'ACTIVE',
    issuedAt: new Date(now - 1_000),
    expiresAt: new Date(now + 300_000),
    usedAt: null,
    application: {
      id: '33333333-3333-4333-8333-333333333333',
      clientId: 'app-a',
      clientSecretHash: 'secret-hash',
      status: 'ACTIVE',
    },
    user: {
      id: '22222222-2222-4222-8222-222222222222',
      status: 'ACTIVE',
    },
    centralSession: {
      id: '44444444-4444-4444-8444-444444444444',
      status: 'ACTIVE',
      expiresAt: new Date(now + 3_600_000),
      revokedAt: null,
    },
  };
  const dto = {
    grant_type: 'authorization_code' as const,
    code: 'raw-authorization-code-value-123456',
    redirect_uri: 'http://localhost:4001/callback',
    client_id: 'app-a',
    client_secret: 'client-secret-development',
    code_verifier: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ123456',
  };
  const transaction = {
    authorizationCode: { updateMany: jest.fn() },
    accessToken: { create: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const authPrisma = {
    authorizationCode: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const configService = { getOrThrow: jest.fn() };
  const passwordService = { verify: jest.fn() };
  const tokenService = {
    hash: jest.fn(),
    createPkceChallenge: jest.fn(),
    generateOpaqueToken: jest.fn(),
  };
  let service: TokenExchangeService;

  beforeEach(() => {
    jest.clearAllMocks();
    authPrisma.authorizationCode.findUnique.mockResolvedValue(
      authorizationCode,
    );
    authPrisma.$transaction.mockImplementation(
      async (
        callback: (client: typeof transaction) => Promise<unknown>,
      ): Promise<unknown> => callback(transaction),
    );
    configService.getOrThrow.mockReturnValue(900);
    passwordService.verify.mockResolvedValue(true);
    tokenService.hash
      .mockReturnValueOnce('code-hash')
      .mockReturnValueOnce('access-token-hash');
    tokenService.createPkceChallenge.mockReturnValue('expected-challenge');
    tokenService.generateOpaqueToken.mockReturnValue('raw-access-token');
    transaction.authorizationCode.updateMany.mockResolvedValue({ count: 1 });
    transaction.accessToken.create.mockResolvedValue({});
    transaction.auditLog.create.mockResolvedValue({});

    service = new TokenExchangeService(
      authPrisma as unknown as AuthPrismaService,
      configService as unknown as ConfigService,
      passwordService as unknown as PasswordService,
      tokenService,
    );
  });

  it('menukar grant valid menjadi opaque access token', async () => {
    await expect(service.exchange(dto)).resolves.toEqual({
      access_token: 'raw-access-token',
      token_type: 'Bearer',
      expires_in: 900,
    });
    expect(passwordService.verify).toHaveBeenCalledWith(
      'secret-hash',
      dto.client_secret,
    );
    expect(tokenService.createPkceChallenge).toHaveBeenCalledWith(
      dto.code_verifier,
    );
  });

  it('menyimpan hash token tanpa menyimpan raw token', async () => {
    let storedTokenData: Record<string, unknown> | undefined;
    transaction.accessToken.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => {
        storedTokenData = data;
        return Promise.resolve({});
      },
    );

    await service.exchange(dto);

    expect(storedTokenData).toMatchObject({
      tokenHash: 'access-token-hash',
      userId: authorizationCode.userId,
      applicationId: authorizationCode.applicationId,
      centralSessionId: authorizationCode.centralSessionId,
    });
    expect(storedTokenData).not.toHaveProperty('token');
  });

  it('menolak authorization code yang tidak ditemukan dengan error generik', async () => {
    authPrisma.authorizationCode.findUnique.mockResolvedValue(null);

    await expect(service.exchange(dto)).rejects.toMatchObject({
      message: 'The authorization grant is invalid',
    });
    expect(authPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('menolak PKCE verifier yang salah dengan error generik yang sama', async () => {
    tokenService.createPkceChallenge.mockReturnValue('wrong-challenge');

    await expect(service.exchange(dto)).rejects.toMatchObject({
      message: 'The authorization grant is invalid',
    });
    expect(authPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('menolak replay ketika conditional update tidak mengubah record', async () => {
    transaction.authorizationCode.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.exchange(dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(transaction.accessToken.create).not.toHaveBeenCalled();
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
  });

  it.each([
    ['code used', { status: 'USED' }],
    ['code expired', { expiresAt: new Date(now - 1_000) }],
    ['redirect URI salah', { redirectUri: 'http://localhost:4002/callback' }],
  ])('menolak %s', async (_name, override) => {
    authPrisma.authorizationCode.findUnique.mockResolvedValue({
      ...authorizationCode,
      ...override,
    });

    await expect(service.exchange(dto)).rejects.toMatchObject({
      message: 'The authorization grant is invalid',
    });
  });
});
