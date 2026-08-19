import { ConflictException, NotFoundException } from '@nestjs/common';
import { AuthPrismaService, Prisma } from '@app/auth-database';
import { GroupsService } from './groups.service';

describe('GroupsService', () => {
  const groupRecord = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'app-a-users',
    createdAt: new Date('2026-08-16T00:00:00.000Z'),
    updatedAt: new Date('2026-08-16T00:00:00.000Z'),
    _count: { users: 0 },
  };
  const userRecord = {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Test User',
    email: 'test@example.com',
    status: 'ACTIVE' as const,
    passwordChangedAt: null,
    createdAt: new Date('2026-08-16T00:00:00.000Z'),
    updatedAt: new Date('2026-08-16T00:00:00.000Z'),
  };
  const transactionMock = {
    group: {
      create: jest.fn(),
      update: jest.fn(),
    },
    userGroup: {
      create: jest.fn(),
      delete: jest.fn(),
    },
    applicationGroup: { findFirst: jest.fn() },
    event: { create: jest.fn() },
    auditLog: {
      create: jest.fn(),
    },
  };
  const authPrismaMock = {
    $transaction: jest.fn(),
    group: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    userGroup: {
      findUnique: jest.fn(),
    },
    applicationGroup: { findMany: jest.fn() },
  };
  let service: GroupsService;

  beforeEach(() => {
    jest.clearAllMocks();
    authPrismaMock.$transaction.mockImplementation(
      async (
        callback: (transaction: typeof transactionMock) => Promise<unknown>,
      ) => callback(transactionMock),
    );
    authPrismaMock.applicationGroup.findMany.mockResolvedValue([]);
    service = new GroupsService(authPrismaMock as unknown as AuthPrismaService);
  });

  it('membuat group dan mengembalikan jumlah anggota nol', async () => {
    transactionMock.group.create.mockResolvedValue(groupRecord);
    transactionMock.auditLog.create.mockResolvedValue({});

    await expect(service.create('app-a-users')).resolves.toEqual({
      id: groupRecord.id,
      name: groupRecord.name,
      memberCount: 0,
      createdAt: groupRecord.createdAt,
      updatedAt: groupRecord.updatedAt,
    });
    expect(transactionMock.auditLog.create).toHaveBeenCalledWith({
      data: {
        eventType: 'GROUP_CHANGED',
        result: 'success',
        metadata: { action: 'create', groupId: groupRecord.id },
      },
    });
  });

  it('mengubah duplicate name menjadi ConflictException', async () => {
    const error = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: '6.19.0',
    });
    authPrismaMock.$transaction.mockRejectedValue(error);

    await expect(service.create('app-a-users')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('menolak detail group yang tidak ditemukan', async () => {
    authPrismaMock.group.findUnique.mockResolvedValue(null);

    await expect(service.findOne(groupRecord.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('mengembalikan anggota tanpa passwordHash', async () => {
    authPrismaMock.group.findUnique.mockResolvedValue({
      ...groupRecord,
      _count: { users: 1 },
      users: [{ assignedAt: new Date(), user: userRecord }],
    });

    const result = await service.findOne(groupRecord.id);

    expect(result.members).toEqual([userRecord]);
    expect(result.members[0]).not.toHaveProperty('passwordHash');
  });

  it('memastikan user dan group ada sebelum menambah membership', async () => {
    authPrismaMock.group.findUnique.mockResolvedValue(groupRecord);
    authPrismaMock.user.findUnique.mockResolvedValue(userRecord);
    transactionMock.userGroup.create.mockResolvedValue({});
    transactionMock.auditLog.create.mockResolvedValue({});

    await service.addMember(groupRecord.id, userRecord.id);

    expect(transactionMock.userGroup.create).toHaveBeenCalledWith({
      data: { groupId: groupRecord.id, userId: userRecord.id },
    });
    expect(transactionMock.auditLog.create).toHaveBeenCalled();
  });

  it('menolak membership yang sudah ada', async () => {
    authPrismaMock.group.findUnique.mockResolvedValue(groupRecord);
    authPrismaMock.user.findUnique.mockResolvedValue(userRecord);
    authPrismaMock.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '6.19.0',
      }),
    );

    await expect(
      service.addMember(groupRecord.id, userRecord.id),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('menghapus membership dan menulis audit dalam transaction', async () => {
    authPrismaMock.userGroup.findUnique.mockResolvedValue({
      groupId: groupRecord.id,
      userId: userRecord.id,
      assignedAt: new Date(),
    });
    transactionMock.userGroup.delete.mockResolvedValue({});
    transactionMock.auditLog.create.mockResolvedValue({});

    await service.removeMember(groupRecord.id, userRecord.id);

    expect(transactionMock.userGroup.delete).toHaveBeenCalledWith({
      where: {
        userId_groupId: {
          userId: userRecord.id,
          groupId: groupRecord.id,
        },
      },
    });
    expect(transactionMock.auditLog.create).toHaveBeenCalled();
  });
});
