import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AuthPrismaService } from '@app/auth-database';
import { PasswordService } from '@app/security';
import { UsersService } from './users.service';

const USER = {
  id: '3d931343-e73a-40cb-9951-f10a097b8b39',
  name: 'Test User',
  email: 'test@example.com',
  status: 'ACTIVE' as const,
  passwordChangedAt: null,
  createdAt: new Date('2026-08-16T00:00:00.000Z'),
  updatedAt: new Date('2026-08-16T00:00:00.000Z'),
};

describe('UsersService', () => {
  const transaction = {
    user: { create: jest.fn(), update: jest.fn() },
    centralSession: { updateMany: jest.fn() },
    auditLog: { create: jest.fn() },
    event: { create: jest.fn() },
  };
  const authPrisma = {
    $transaction: jest.fn(
      async (
        callback: (client: typeof transaction) => Promise<unknown>,
      ): Promise<unknown> => callback(transaction),
    ),
    user: { findMany: jest.fn(), findUnique: jest.fn() },
    application: { findMany: jest.fn() },
  };
  const passwordService = { hash: jest.fn() };
  let service: UsersService;

  beforeEach(() => {
    jest.clearAllMocks();
    authPrisma.application.findMany.mockResolvedValue([]);
    service = new UsersService(
      authPrisma as unknown as AuthPrismaService,
      passwordService as unknown as PasswordService,
    );
  });

  it('membuat user menggunakan password hash dan audit', async () => {
    let storedPasswordHash = '';
    passwordService.hash.mockResolvedValue('argon2-hash');
    transaction.user.create.mockImplementation(
      ({ data }: { data: { passwordHash: string } }) => {
        storedPasswordHash = data.passwordHash;
        return Promise.resolve(USER);
      },
    );
    transaction.auditLog.create.mockResolvedValue({ id: 'audit-id' });

    await expect(
      service.create({
        name: USER.name,
        email: USER.email,
        password: 'password-test-aman',
      }),
    ).resolves.toEqual(USER);

    expect(storedPasswordHash).toBe('argon2-hash');
    expect(transaction.auditLog.create).toHaveBeenCalled();
  });

  it('mengembalikan daftar user tanpa credential', async () => {
    authPrisma.user.findMany.mockResolvedValue([USER]);

    const result = await service.findAll();

    expect(result).toEqual([USER]);
    expect(result[0]).not.toHaveProperty('passwordHash');
  });

  it('menghasilkan not found untuk id yang tidak dikenal', async () => {
    authPrisma.user.findUnique.mockResolvedValue(null);

    await expect(service.findOne(USER.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('menolak update tanpa field', async () => {
    await expect(service.update(USER.id, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('mencabut session ketika user dinonaktifkan', async () => {
    let revokeReason = '';
    transaction.user.update.mockResolvedValue({ ...USER, status: 'INACTIVE' });
    transaction.centralSession.updateMany.mockImplementation(
      ({ data }: { data: { revokeReason: string } }) => {
        revokeReason = data.revokeReason;
        return Promise.resolve({ count: 2 });
      },
    );
    transaction.auditLog.create.mockResolvedValue({ id: 'audit-id' });

    await service.updateStatus(USER.id, { status: 'INACTIVE' });

    expect(revokeReason).toBe('user_inactive');
  });

  it('mengganti password dan mencabut session dalam transaction', async () => {
    let storedPasswordHash = '';
    let revokeReason = '';
    passwordService.hash.mockResolvedValue('new-argon2-hash');
    transaction.user.update.mockImplementation(
      ({ data }: { data: { passwordHash: string } }) => {
        storedPasswordHash = data.passwordHash;
        return Promise.resolve({ ...USER, passwordChangedAt: new Date() });
      },
    );
    transaction.centralSession.updateMany.mockImplementation(
      ({ data }: { data: { revokeReason: string } }) => {
        revokeReason = data.revokeReason;
        return Promise.resolve({ count: 1 });
      },
    );
    transaction.auditLog.create.mockResolvedValue({ id: 'audit-id' });

    await service.changePassword(USER.id, {
      password: 'password-baru-aman',
    });

    expect(storedPasswordHash).toBe('new-argon2-hash');
    expect(revokeReason).toBe('password_changed');
  });
});
