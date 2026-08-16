import { ConfigService } from '@nestjs/config';
import { AuthPrismaService } from '@app/auth-database';
import { TokenService } from '@app/security';
import { SessionService } from './session.service';

const USER = {
  id: '45bb7591-8bc8-40f5-a658-e1ec34c5bab5',
  name: 'Test User',
  email: 'test@example.com',
  status: 'ACTIVE' as const,
  passwordChangedAt: null,
  createdAt: new Date('2026-08-16T00:00:00.000Z'),
  updatedAt: new Date('2026-08-16T00:00:00.000Z'),
};

describe('SessionService', () => {
  const sessionRecord = {
    id: '170c7471-9262-4a3d-986a-0fd0d1df2661',
    sessionTokenHash: 'a'.repeat(64),
    userId: USER.id,
    status: 'ACTIVE' as const,
    createdAt: new Date('2026-08-16T00:00:00.000Z'),
    expiresAt: new Date('2099-08-16T08:00:00.000Z'),
    lastActivityAt: null,
    revokedAt: null,
    revokeReason: null,
  };
  const transaction = {
    centralSession: {
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    auditLog: { create: jest.fn() },
  };
  const authPrisma = {
    $transaction: jest.fn(
      async (
        callback: (client: typeof transaction) => Promise<unknown>,
      ): Promise<unknown> => callback(transaction),
    ),
    centralSession: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const configService = {
    getOrThrow: jest.fn().mockReturnValue(28800),
  };
  const tokenService = {
    generateOpaqueToken: jest.fn(),
    hash: jest.fn(),
  };
  let service: SessionService;

  beforeEach(() => {
    jest.clearAllMocks();
    configService.getOrThrow.mockReturnValue(28800);
    tokenService.generateOpaqueToken.mockReturnValue('raw-session-token');
    tokenService.hash.mockReturnValue('a'.repeat(64));
    service = new SessionService(
      authPrisma as unknown as AuthPrismaService,
      configService as unknown as ConfigService,
      tokenService as unknown as TokenService,
    );
  });

  it('menyimpan hash token, bukan token asli', async () => {
    let storedHash = '';
    transaction.centralSession.create.mockImplementation(
      ({ data }: { data: { sessionTokenHash: string } }) => {
        storedHash = data.sessionTokenHash;
        return Promise.resolve({ ...sessionRecord, ...data });
      },
    );
    transaction.auditLog.create.mockResolvedValue({ id: 'audit-id' });

    const result = await service.create(USER);
    expect(tokenService.hash).toHaveBeenCalledWith('raw-session-token');
    expect(result.token).not.toBe(storedHash);
    expect(storedHash).toHaveLength(64);
    expect(result.auth.user).toEqual(USER);
  });

  it('menerima session aktif milik user aktif', async () => {
    authPrisma.centralSession.findUnique.mockResolvedValue({
      ...sessionRecord,
      user: USER,
    });

    await expect(service.getValidSession('token')).resolves.toEqual({
      user: USER,
      session: {
        id: sessionRecord.id,
        status: 'ACTIVE',
        createdAt: sessionRecord.createdAt,
        expiresAt: sessionRecord.expiresAt,
      },
    });
  });

  it('menolak dan menandai session kedaluwarsa', async () => {
    authPrisma.centralSession.findUnique.mockResolvedValue({
      ...sessionRecord,
      expiresAt: new Date('2020-01-01T00:00:00.000Z'),
      user: USER,
    });
    authPrisma.centralSession.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.getValidSession('token')).resolves.toBeNull();
    expect(authPrisma.centralSession.updateMany).toHaveBeenCalled();
  });

  it('mencabut session secara idempotent', async () => {
    let revokeReason = '';
    authPrisma.centralSession.findUnique.mockResolvedValue(sessionRecord);
    transaction.centralSession.updateMany.mockImplementation(
      ({ data }: { data: { revokeReason: string } }) => {
        revokeReason = data.revokeReason;
        return Promise.resolve({ count: 1 });
      },
    );
    transaction.auditLog.create.mockResolvedValue({ id: 'audit-id' });

    await service.revoke('token');

    expect(revokeReason).toBe('central_logout');
    expect(transaction.auditLog.create).toHaveBeenCalled();
  });
});
