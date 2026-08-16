import { UnauthorizedException } from '@nestjs/common';
import { AuthPrismaService } from '@app/auth-database';
import { TokenService } from '@app/security';
import { UserInfoService } from './userinfo.service';

describe('UserInfoService', () => {
  const now = Date.now();
  const accessToken = {
    id: '11111111-1111-4111-8111-111111111111',
    tokenHash: 'token-hash',
    userId: '22222222-2222-4222-8222-222222222222',
    applicationId: '33333333-3333-4333-8333-333333333333',
    centralSessionId: '44444444-4444-4444-8444-444444444444',
    status: 'ACTIVE',
    issuedAt: new Date(now - 1_000),
    expiresAt: new Date(now + 900_000),
    revokedAt: null,
    scopes: [],
    user: {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Test User',
      email: 'test@example.com',
      status: 'ACTIVE',
      groups: [
        {
          assignedAt: new Date(now - 1_000),
          group: { name: 'app-a-users' },
        },
      ],
    },
    application: { status: 'ACTIVE' },
    centralSession: {
      status: 'ACTIVE',
      expiresAt: new Date(now + 3_600_000),
      revokedAt: null,
    },
  };
  const authPrisma = {
    accessToken: { findUnique: jest.fn() },
  };
  const tokenService = { hash: jest.fn() };
  let service: UserInfoService;

  beforeEach(() => {
    jest.clearAllMocks();
    authPrisma.accessToken.findUnique.mockResolvedValue(accessToken);
    tokenService.hash.mockReturnValue('token-hash');
    service = new UserInfoService(
      authPrisma as unknown as AuthPrismaService,
      tokenService as unknown as TokenService,
    );
  });

  it('mengembalikan profil aman untuk token valid', async () => {
    await expect(service.getProfile('raw-access-token')).resolves.toEqual({
      sub: accessToken.userId,
      name: 'Test User',
      email: 'test@example.com',
      groups: ['app-a-users'],
      centralSessionId: accessToken.centralSessionId,
    });
  });

  it('mencari database menggunakan hash token', async () => {
    await service.getProfile('raw-access-token');

    expect(tokenService.hash).toHaveBeenCalledWith('raw-access-token');
    expect(authPrisma.accessToken.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: 'token-hash' } }),
    );
  });

  it('tidak membocorkan hash atau credential pada response', async () => {
    const result = await service.getProfile('raw-access-token');

    expect(result).not.toHaveProperty('tokenHash');
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('clientSecretHash');
  });

  it('menolak token yang tidak ditemukan', async () => {
    authPrisma.accessToken.findUnique.mockResolvedValue(null);

    await expect(service.getProfile('unknown-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it.each([
    ['token revoked', { status: 'REVOKED' }],
    ['token expired', { expiresAt: new Date(now - 1_000) }],
  ])('menolak %s', async (_name, override) => {
    authPrisma.accessToken.findUnique.mockResolvedValue({
      ...accessToken,
      ...override,
    });

    await expect(service.getProfile('raw-access-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('menolak central session yang sudah revoked', async () => {
    authPrisma.accessToken.findUnique.mockResolvedValue({
      ...accessToken,
      centralSession: {
        ...accessToken.centralSession,
        status: 'REVOKED',
        revokedAt: new Date(),
      },
    });

    await expect(service.getProfile('raw-access-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
