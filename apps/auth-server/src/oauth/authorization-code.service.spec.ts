import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthPrismaService } from '@app/auth-database';
import { TokenService } from '@app/security';
import { PolicyEvaluatorService } from '../authorization/policy-evaluator.service';
import { AuthorizationCodeService } from './authorization-code.service';

describe('AuthorizationCodeService', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const applicationId = '22222222-2222-4222-8222-222222222222';
  const centralSessionId = '33333333-3333-4333-8333-333333333333';
  const redirectUri = 'http://localhost:4001/callback';
  const transaction = {
    authorizationCode: { create: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const authPrisma = {
    $transaction: jest.fn(),
  };
  const configService = { getOrThrow: jest.fn() };
  const tokenService = {
    generateOpaqueToken: jest.fn(),
    hash: jest.fn(),
  };
  const policyEvaluator = { evaluate: jest.fn() };
  let service: AuthorizationCodeService;

  beforeEach(() => {
    jest.clearAllMocks();
    authPrisma.$transaction.mockImplementation(
      async (
        callback: (client: typeof transaction) => Promise<unknown>,
      ): Promise<unknown> => callback(transaction),
    );
    configService.getOrThrow.mockReturnValue(300);
    tokenService.generateOpaqueToken.mockReturnValue('raw-code');
    tokenService.hash.mockReturnValue('code-hash');
    policyEvaluator.evaluate.mockResolvedValue({
      applicationId,
      userId,
      clientId: 'app-a',
      redirectUri,
    });
    transaction.authorizationCode.create.mockResolvedValue({});
    transaction.auditLog.create.mockResolvedValue({});

    service = new AuthorizationCodeService(
      authPrisma as unknown as AuthPrismaService,
      configService as unknown as ConfigService,
      tokenService as unknown as TokenService,
      policyEvaluator as unknown as PolicyEvaluatorService,
    );
  });

  it('mengevaluasi policy lalu menyimpan hash code dan seluruh binding', async () => {
    const before = Date.now();
    let storedExpiresAt: Date | undefined;
    transaction.authorizationCode.create.mockImplementation(
      ({ data }: { data: { expiresAt: Date } }) => {
        storedExpiresAt = data.expiresAt;
        return Promise.resolve({});
      },
    );

    const result = await service.issue({
      userId,
      centralSessionId,
      clientId: 'app-a',
      redirectUri,
      state: 'state-yang-panjang-dan-acak-123456',
      codeChallenge: 'challenge-value',
    });

    const after = Date.now();
    expect(policyEvaluator.evaluate).toHaveBeenCalledWith(
      userId,
      'app-a',
      redirectUri,
    );
    expect(transaction.authorizationCode.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        codeHash: 'code-hash',
        userId,
        applicationId,
        centralSessionId,
        redirectUri,
        codeChallenge: 'challenge-value',
        codeChallengeMethod: 'S256',
      }),
    });
    expect(storedExpiresAt).toBeDefined();
    if (!storedExpiresAt) {
      throw new Error('expiresAt tidak tersimpan');
    }
    expect(storedExpiresAt.getTime()).toBeGreaterThanOrEqual(before + 300_000);
    expect(storedExpiresAt.getTime()).toBeLessThanOrEqual(after + 300_000);
    expect(result.code).toBe('raw-code');
    expect(transaction.authorizationCode.create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ code: 'raw-code' }),
      }),
    );
  });

  it('membuat audit code issuance dalam transaction yang sama', async () => {
    await service.issue({
      userId,
      centralSessionId,
      clientId: 'app-a',
      redirectUri,
      state: 'state-yang-panjang-dan-acak-123456',
      codeChallenge: 'challenge-value',
    });

    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: {
        eventType: 'AUTHORIZATION_CODE_ISSUED',
        userId,
        applicationId,
        sessionId: centralSessionId,
        result: 'success',
      },
    });
  });

  it('tidak membuat code ketika policy menolak', async () => {
    policyEvaluator.evaluate.mockRejectedValue(
      new ForbiddenException('Akses ke aplikasi ditolak'),
    );

    await expect(
      service.issue({
        userId,
        centralSessionId,
        clientId: 'app-a',
        redirectUri,
        state: 'state-yang-panjang-dan-acak-123456',
        codeChallenge: 'challenge-value',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tokenService.generateOpaqueToken).not.toHaveBeenCalled();
    expect(authPrisma.$transaction).not.toHaveBeenCalled();
  });
});
