import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthPrismaService, Prisma } from '@app/auth-database';
import type { GroupDetailResponse, GroupSummaryResponse } from '@app/contracts';

const SAFE_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  status: true,
  passwordChangedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class GroupsService {
  constructor(private readonly authPrisma: AuthPrismaService) {}

  async create(name: string): Promise<GroupSummaryResponse> {
    try {
      return await this.authPrisma.$transaction(async (transaction) => {
        const group = await transaction.group.create({
          data: { name },
          include: { _count: { select: { users: true } } },
        });

        await transaction.auditLog.create({
          data: {
            eventType: 'GROUP_CHANGED',
            result: 'success',
            metadata: { action: 'create', groupId: group.id },
          },
        });

        return this.toSummary(group);
      });
    } catch (error: unknown) {
      this.rethrowDatabaseError(error);
    }
  }

  async findAll(): Promise<GroupSummaryResponse[]> {
    const groups = await this.authPrisma.group.findMany({
      include: { _count: { select: { users: true } } },
      orderBy: { name: 'asc' },
    });

    return groups.map((group) => this.toSummary(group));
  }

  async findOne(id: string): Promise<GroupDetailResponse> {
    const group = await this.authPrisma.group.findUnique({
      where: { id },
      include: {
        _count: { select: { users: true } },
        users: {
          include: { user: { select: SAFE_USER_SELECT } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!group) {
      throw new NotFoundException('Group tidak ditemukan');
    }

    return {
      ...this.toSummary(group),
      members: group.users.map((membership) => membership.user),
    };
  }

  async update(id: string, name: string): Promise<GroupSummaryResponse> {
    try {
      return await this.authPrisma.$transaction(async (transaction) => {
        const group = await transaction.group.update({
          where: { id },
          data: { name },
          include: { _count: { select: { users: true } } },
        });

        await transaction.auditLog.create({
          data: {
            eventType: 'GROUP_CHANGED',
            result: 'success',
            metadata: { action: 'update', groupId: group.id },
          },
        });

        return this.toSummary(group);
      });
    } catch (error: unknown) {
      this.rethrowDatabaseError(error);
    }
  }

  async addMember(groupId: string, userId: string): Promise<void> {
    const [group, user] = await Promise.all([
      this.authPrisma.group.findUnique({ where: { id: groupId } }),
      this.authPrisma.user.findUnique({ where: { id: userId } }),
    ]);

    if (!group) {
      throw new NotFoundException('Group tidak ditemukan');
    }

    if (!user) {
      throw new NotFoundException('User tidak ditemukan');
    }

    try {
      await this.authPrisma.$transaction(async (transaction) => {
        await transaction.userGroup.create({ data: { groupId, userId } });
        await transaction.auditLog.create({
          data: {
            eventType: 'GROUP_MEMBERSHIP_CHANGED',
            userId,
            result: 'success',
            metadata: { action: 'add', groupId },
          },
        });
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('User sudah menjadi anggota group');
      }
      throw error;
    }
  }

  async removeMember(groupId: string, userId: string): Promise<void> {
    const membership = await this.authPrisma.userGroup.findUnique({
      where: { userId_groupId: { userId, groupId } },
    });

    if (!membership) {
      throw new NotFoundException('Keanggotaan group tidak ditemukan');
    }

    const candidateApplications =
      await this.authPrisma.applicationGroup.findMany({
        where: { groupId },
        select: { applicationId: true },
      });

    await this.authPrisma.$transaction(async (transaction) => {
      await transaction.userGroup.delete({
        where: { userId_groupId: { userId, groupId } },
      });
      for (const candidate of candidateApplications) {
        const remainingPolicy = await transaction.applicationGroup.findFirst({
          where: {
            applicationId: candidate.applicationId,
            group: { users: { some: { userId } } },
          },
        });
        if (!remainingPolicy) {
          await transaction.event.create({
            data: {
              eventType: 'AccessPolicyChanged',
              userId,
              applicationId: candidate.applicationId,
              payload: {
                reason: 'group_membership_removed',
                metadata: { groupId },
              },
              deliveries: {
                create: { applicationId: candidate.applicationId },
              },
            },
          });
        }
      }
      await transaction.auditLog.create({
        data: {
          eventType: 'GROUP_MEMBERSHIP_CHANGED',
          userId,
          result: 'success',
          metadata: { action: 'remove', groupId },
        },
      });
    });
  }

  private toSummary(group: {
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    _count: { users: number };
  }): GroupSummaryResponse {
    return {
      id: group.id,
      name: group.name,
      memberCount: group._count.users,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
  }

  private rethrowDatabaseError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException('Nama group sudah digunakan');
      }

      if (error.code === 'P2025') {
        throw new NotFoundException('Group tidak ditemukan');
      }
    }

    throw error;
  }
}
