import { ForbiddenException } from '@nestjs/common';
import { AuthPrismaService } from '@app/auth-database';
import { PolicyEvaluatorService } from './policy-evaluator.service';

describe('PolicyEvaluatorService', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const applicationId = '22222222-2222-4222-8222-222222222222';
  const clientId = 'app-a';
  const redirectUri = 'http://localhost:4001/callback';
  const authPrisma = {
    user: { findUnique: jest.fn() },
    application: { findUnique: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  let service: PolicyEvaluatorService;

  beforeEach(() => {
    jest.clearAllMocks();
    authPrisma.auditLog.create.mockResolvedValue({});
    service = new PolicyEvaluatorService(
      authPrisma as unknown as AuthPrismaService,
    );
  });

  function allowUser(): void {
    authPrisma.user.findUnique.mockResolvedValue({
      id: userId,
      status: 'ACTIVE',
    });
    authPrisma.application.findUnique.mockResolvedValue({
      id: applicationId,
      clientId,
      status: 'ACTIVE',
      redirectUris: [{ id: 'redirect-id' }],
      groups: [{ groupId: 'group-id' }],
    });
  }

  it('mengizinkan jika seluruh kondisi policy terpenuhi', async () => {
    allowUser();

    await expect(
      service.evaluate(userId, clientId, redirectUri),
    ).resolves.toEqual({ applicationId, userId, clientId, redirectUri });
    expect(authPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('mengirim hash dan URL lengkap pada query exact match', async () => {
    allowUser();

    await service.evaluate(userId, clientId, redirectUri);

    expect(authPrisma.application.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          redirectUris: expect.objectContaining({
            where: {
              redirectUriHash:
                '736a9a6df5339e06e3b078b98d982eb44423d196c6515566c10b9872f45947c3',
              redirectUri,
            },
          }),
        }),
      }),
    );
  });

  it.each([
    ['user inactive', { userStatus: 'INACTIVE', appStatus: 'ACTIVE' }],
    ['application inactive', { userStatus: 'ACTIVE', appStatus: 'INACTIVE' }],
  ])('menolak ketika %s', async (_name, state) => {
    authPrisma.user.findUnique.mockResolvedValue({
      id: userId,
      status: state.userStatus,
    });
    authPrisma.application.findUnique.mockResolvedValue({
      id: applicationId,
      clientId,
      status: state.appStatus,
      redirectUris: [{ id: 'redirect-id' }],
      groups: [{ groupId: 'group-id' }],
    });

    await expect(
      service.evaluate(userId, clientId, redirectUri),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(authPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'POLICY_DENIED',
        result: 'failed',
      }),
    });
  });

  it('menolak redirect URI yang tidak exact match', async () => {
    authPrisma.user.findUnique.mockResolvedValue({
      id: userId,
      status: 'ACTIVE',
    });
    authPrisma.application.findUnique.mockResolvedValue({
      id: applicationId,
      clientId,
      status: 'ACTIVE',
      redirectUris: [],
      groups: [{ groupId: 'group-id' }],
    });

    await expect(
      service.evaluate(userId, clientId, `${redirectUri}/evil`),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('menolak ketika tidak ada group user yang dipolicy-kan', async () => {
    authPrisma.user.findUnique.mockResolvedValue({
      id: userId,
      status: 'ACTIVE',
    });
    authPrisma.application.findUnique.mockResolvedValue({
      id: applicationId,
      clientId,
      status: 'ACTIVE',
      redirectUris: [{ id: 'redirect-id' }],
      groups: [],
    });

    await expect(
      service.evaluate(userId, clientId, redirectUri),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
