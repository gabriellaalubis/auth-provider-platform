import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApplicationStatus,
  AuthPrismaService,
  Prisma,
} from '@app/auth-database';
import type {
  ApplicationResponse,
  CreatedApplicationResponse,
} from '@app/contracts';
import { PasswordService } from '@app/security';
import { createHash } from 'node:crypto';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';

const APPLICATION_INCLUDE = {
  redirectUris: { orderBy: { createdAt: 'asc' as const } },
  groups: {
    include: { group: true },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.ApplicationInclude;

type ApplicationWithRelations = Prisma.ApplicationGetPayload<{
  include: typeof APPLICATION_INCLUDE;
}>;

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly authPrisma: AuthPrismaService,
    private readonly passwordService: PasswordService,
  ) {}

  async create(dto: CreateApplicationDto): Promise<CreatedApplicationResponse> {
    const clientSecretHash = await this.passwordService.hash(dto.clientSecret);

    try {
      const application = await this.authPrisma.$transaction(
        async (transaction) => {
          const created = await transaction.application.create({
            data: {
              name: dto.name,
              clientId: dto.clientId,
              clientSecretHash,
              launchUrl: dto.launchUrl,
              logoutNotificationUrl: dto.logoutNotificationUrl,
              redirectUris: {
                create: dto.redirectUris.map((redirectUri) => ({
                  redirectUri,
                  redirectUriHash: this.hashRedirectUri(redirectUri),
                })),
              },
            },
            include: APPLICATION_INCLUDE,
          });

          await transaction.auditLog.create({
            data: {
              eventType: 'APPLICATION_CHANGED',
              applicationId: created.id,
              result: 'success',
              metadata: { action: 'create' },
            },
          });

          return created;
        },
      );

      return {
        ...this.toResponse(application),
        clientSecret: dto.clientSecret,
      };
    } catch (error: unknown) {
      this.rethrowDatabaseError(error);
    }
  }

  async findAll(): Promise<ApplicationResponse[]> {
    const applications = await this.authPrisma.application.findMany({
      include: APPLICATION_INCLUDE,
      orderBy: { name: 'asc' },
    });

    return applications.map((application) => this.toResponse(application));
  }

  async findOne(id: string): Promise<ApplicationResponse> {
    const application = await this.authPrisma.application.findUnique({
      where: { id },
      include: APPLICATION_INCLUDE,
    });

    if (!application) {
      throw new NotFoundException('Application tidak ditemukan');
    }

    return this.toResponse(application);
  }

  async update(
    id: string,
    dto: UpdateApplicationDto,
  ): Promise<ApplicationResponse> {
    if (
      dto.name === undefined &&
      dto.redirectUris === undefined &&
      dto.launchUrl === undefined &&
      dto.logoutNotificationUrl === undefined &&
      dto.status === undefined
    ) {
      throw new BadRequestException('Tidak ada data yang diperbarui');
    }

    const existing = await this.authPrisma.application.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Application tidak ditemukan');
    }

    const usersToRevoke =
      dto.status === 'INACTIVE'
        ? await this.authPrisma.accessToken.findMany({
            where: { applicationId: id },
            select: { userId: true },
            distinct: ['userId'],
          })
        : [];

    try {
      return await this.authPrisma.$transaction(async (transaction) => {
        await transaction.application.update({
          where: { id },
          data: {
            ...(dto.name !== undefined && { name: dto.name }),
            ...(dto.launchUrl !== undefined && { launchUrl: dto.launchUrl }),
            ...(dto.logoutNotificationUrl !== undefined && {
              logoutNotificationUrl: dto.logoutNotificationUrl,
            }),
            ...(dto.status !== undefined && {
              status:
                dto.status === 'ACTIVE'
                  ? ApplicationStatus.ACTIVE
                  : ApplicationStatus.INACTIVE,
            }),
          },
        });

        if (dto.redirectUris !== undefined) {
          await transaction.applicationRedirectUri.deleteMany({
            where: { applicationId: id },
          });
          await transaction.applicationRedirectUri.createMany({
            data: dto.redirectUris.map((redirectUri) => ({
              applicationId: id,
              redirectUri,
              redirectUriHash: this.hashRedirectUri(redirectUri),
            })),
          });
        }

        await transaction.auditLog.create({
          data: {
            eventType: 'APPLICATION_CHANGED',
            applicationId: id,
            result: 'success',
            metadata: { action: 'update' },
          },
        });
        for (const target of usersToRevoke) {
          await transaction.event.create({
            data: {
              eventType: 'AccessPolicyChanged',
              userId: target.userId,
              applicationId: id,
              payload: { reason: 'application_inactive', metadata: {} },
              deliveries: { create: { applicationId: id } },
            },
          });
        }

        const application = await transaction.application.findUnique({
          where: { id },
          include: APPLICATION_INCLUDE,
        });

        if (!application) {
          throw new NotFoundException('Application tidak ditemukan');
        }

        return this.toResponse(application);
      });
    } catch (error: unknown) {
      this.rethrowDatabaseError(error);
    }
  }

  async addPolicy(applicationId: string, groupId: string): Promise<void> {
    await this.ensureApplicationAndGroupExist(applicationId, groupId);

    try {
      await this.authPrisma.$transaction(async (transaction) => {
        await transaction.applicationGroup.create({
          data: { applicationId, groupId },
        });
        await transaction.auditLog.create({
          data: {
            eventType: 'POLICY_CHANGED',
            applicationId,
            result: 'success',
            metadata: { action: 'allow', groupId },
          },
        });
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Policy sudah tersedia');
      }
      throw error;
    }
  }

  async removePolicy(applicationId: string, groupId: string): Promise<void> {
    const policy = await this.authPrisma.applicationGroup.findUnique({
      where: { applicationId_groupId: { applicationId, groupId } },
    });

    if (!policy) {
      throw new NotFoundException('Policy tidak ditemukan');
    }

    const affectedUsers = await this.authPrisma.userGroup.findMany({
      where: { groupId },
      select: { userId: true },
    });

    await this.authPrisma.$transaction(async (transaction) => {
      await transaction.applicationGroup.delete({
        where: { applicationId_groupId: { applicationId, groupId } },
      });
      for (const affected of affectedUsers) {
        const remainingPolicy = await transaction.applicationGroup.findFirst({
          where: {
            applicationId,
            group: { users: { some: { userId: affected.userId } } },
          },
        });
        if (!remainingPolicy) {
          await transaction.event.create({
            data: {
              eventType: 'AccessPolicyChanged',
              userId: affected.userId,
              applicationId,
              payload: {
                reason: 'application_policy_removed',
                metadata: { groupId },
              },
              deliveries: { create: { applicationId } },
            },
          });
        }
      }
      await transaction.auditLog.create({
        data: {
          eventType: 'POLICY_CHANGED',
          applicationId,
          result: 'success',
          metadata: { action: 'remove', groupId },
        },
      });
    });
  }

  private async ensureApplicationAndGroupExist(
    applicationId: string,
    groupId: string,
  ): Promise<void> {
    const [application, group] = await Promise.all([
      this.authPrisma.application.findUnique({ where: { id: applicationId } }),
      this.authPrisma.group.findUnique({ where: { id: groupId } }),
    ]);

    if (!application) {
      throw new NotFoundException('Application tidak ditemukan');
    }

    if (!group) {
      throw new NotFoundException('Group tidak ditemukan');
    }
  }

  private toResponse(
    application: ApplicationWithRelations,
  ): ApplicationResponse {
    return {
      id: application.id,
      name: application.name,
      clientId: application.clientId,
      status: application.status,
      launchUrl: application.launchUrl,
      logoutNotificationUrl: application.logoutNotificationUrl,
      redirectUris: application.redirectUris.map((item) => item.redirectUri),
      policies: application.groups.map((item) => ({
        groupId: item.group.id,
        groupName: item.group.name,
      })),
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
    };
  }

  private hashRedirectUri(redirectUri: string): string {
    return createHash('sha256').update(redirectUri).digest('hex');
  }

  private rethrowDatabaseError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'Client ID atau redirect URI sudah digunakan',
      );
    }

    throw error;
  }
}
