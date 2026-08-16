import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AuthPrismaService, Prisma } from '@app/auth-database';
import { PasswordService } from '@app/security';
import { createHash } from 'node:crypto';
import { ApplicationsService } from './applications.service';

describe('ApplicationsService', () => {
  const applicationId = '11111111-1111-4111-8111-111111111111';
  const groupId = '22222222-2222-4222-8222-222222222222';
  const redirectUri = 'http://localhost:4001/callback';
  const applicationRecord = {
    id: applicationId,
    name: 'App A',
    clientId: 'app-a',
    clientSecretHash: 'argon2-hash',
    launchUrl: 'http://localhost:4001',
    logoutNotificationUrl: 'http://app-a:4001/internal/logout',
    status: 'ACTIVE' as const,
    createdAt: new Date('2026-08-16T00:00:00.000Z'),
    updatedAt: new Date('2026-08-16T00:00:00.000Z'),
    redirectUris: [
      {
        id: '33333333-3333-4333-8333-333333333333',
        applicationId,
        redirectUri,
        redirectUriHash: createHash('sha256').update(redirectUri).digest('hex'),
        createdAt: new Date('2026-08-16T00:00:00.000Z'),
      },
    ],
    groups: [
      {
        applicationId,
        groupId,
        assignedAt: new Date('2026-08-16T00:00:00.000Z'),
        group: {
          id: groupId,
          name: 'app-a-users',
          createdAt: new Date('2026-08-16T00:00:00.000Z'),
          updatedAt: new Date('2026-08-16T00:00:00.000Z'),
        },
      },
    ],
  };
  const transaction = {
    application: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    applicationRedirectUri: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    applicationGroup: {
      create: jest.fn(),
      delete: jest.fn(),
    },
    auditLog: { create: jest.fn() },
  };
  const authPrisma = {
    $transaction: jest.fn(),
    application: { findMany: jest.fn(), findUnique: jest.fn() },
    group: { findUnique: jest.fn() },
    applicationGroup: { findUnique: jest.fn() },
  };
  const passwordService = { hash: jest.fn() };
  let service: ApplicationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    authPrisma.$transaction.mockImplementation(
      async (
        callback: (client: typeof transaction) => Promise<unknown>,
      ): Promise<unknown> => callback(transaction),
    );
    service = new ApplicationsService(
      authPrisma as unknown as AuthPrismaService,
      passwordService as unknown as PasswordService,
    );
  });

  it('meng-hash secret dan hanya mengembalikan raw secret saat create', async () => {
    passwordService.hash.mockResolvedValue('argon2-hash');
    transaction.application.create.mockResolvedValue(applicationRecord);
    transaction.auditLog.create.mockResolvedValue({});

    const result = await service.create({
      name: 'App A',
      clientId: 'app-a',
      clientSecret: 'client-secret-development',
      redirectUris: [redirectUri],
      launchUrl: 'http://localhost:4001',
      logoutNotificationUrl: 'http://app-a:4001/internal/logout',
    });

    expect(passwordService.hash).toHaveBeenCalledWith(
      'client-secret-development',
    );
    expect(result.clientSecret).toBe('client-secret-development');
    expect(result).not.toHaveProperty('clientSecretHash');
  });

  it('tidak mengembalikan secret atau hash pada daftar application', async () => {
    authPrisma.application.findMany.mockResolvedValue([applicationRecord]);

    const result = await service.findAll();

    expect(result[0]).not.toHaveProperty('clientSecret');
    expect(result[0]).not.toHaveProperty('clientSecretHash');
  });

  it('menolak update kosong', async () => {
    await expect(service.update(applicationId, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('mengganti seluruh redirect URI dalam transaction', async () => {
    authPrisma.application.findUnique.mockResolvedValue({ id: applicationId });
    transaction.application.update.mockResolvedValue(applicationRecord);
    transaction.applicationRedirectUri.deleteMany.mockResolvedValue({
      count: 1,
    });
    transaction.applicationRedirectUri.createMany.mockResolvedValue({
      count: 1,
    });
    transaction.auditLog.create.mockResolvedValue({});
    transaction.application.findUnique.mockResolvedValue(applicationRecord);

    await service.update(applicationId, { redirectUris: [redirectUri] });

    expect(transaction.applicationRedirectUri.deleteMany).toHaveBeenCalledWith({
      where: { applicationId },
    });
    expect(transaction.applicationRedirectUri.createMany).toHaveBeenCalledWith({
      data: [
        {
          applicationId,
          redirectUri,
          redirectUriHash: createHash('sha256')
            .update(redirectUri)
            .digest('hex'),
        },
      ],
    });
  });

  it('mengubah client ID duplikat menjadi ConflictException', async () => {
    passwordService.hash.mockResolvedValue('argon2-hash');
    authPrisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '6.19.0',
      }),
    );

    await expect(
      service.create({
        name: 'App A',
        clientId: 'app-a',
        clientSecret: 'client-secret-development',
        redirectUris: [redirectUri],
        logoutNotificationUrl: 'http://app-a:4001/internal/logout',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('menolak policy yang sudah tersedia', async () => {
    authPrisma.application.findUnique.mockResolvedValue({ id: applicationId });
    authPrisma.group.findUnique.mockResolvedValue({ id: groupId });
    authPrisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '6.19.0',
      }),
    );

    await expect(
      service.addPolicy(applicationId, groupId),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('menolak penghapusan policy yang tidak ditemukan', async () => {
    authPrisma.applicationGroup.findUnique.mockResolvedValue(null);

    await expect(
      service.removePolicy(applicationId, groupId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
