import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuthPrismaService,
  Prisma,
  SessionStatus,
  UserStatus,
} from '@app/auth-database';
import type { UserResponse } from '@app/contracts';
import { PasswordService } from '@app/security';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  status: true,
  passwordChangedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly authPrisma: AuthPrismaService,
    private readonly passwordService: PasswordService,
  ) {}

  async create(dto: CreateUserDto): Promise<UserResponse> {
    const passwordHash = await this.passwordService.hash(dto.password);

    try {
      return await this.authPrisma.$transaction(async (transaction) => {
        const user = await transaction.user.create({
          data: {
            name: dto.name,
            email: dto.email,
            passwordHash,
          },
          select: USER_SELECT,
        });

        await transaction.auditLog.create({
          data: {
            eventType: 'USER_CREATED',
            userId: user.id,
            result: 'success',
          },
        });

        return user;
      });
    } catch (error: unknown) {
      this.rethrowDatabaseError(error);
    }
  }

  async findAll(): Promise<UserResponse[]> {
    return this.authPrisma.user.findMany({
      select: USER_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(id: string): Promise<UserResponse> {
    const user = await this.authPrisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });

    if (!user) {
      throw new NotFoundException('User tidak ditemukan');
    }

    return user;
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserResponse> {
    if (dto.name === undefined && dto.email === undefined) {
      throw new BadRequestException('Tidak ada data yang diperbarui');
    }

    try {
      return await this.authPrisma.$transaction(async (transaction) => {
        const user = await transaction.user.update({
          where: { id },
          data: {
            ...(dto.name !== undefined && { name: dto.name }),
            ...(dto.email !== undefined && { email: dto.email }),
          },
          select: USER_SELECT,
        });

        await transaction.auditLog.create({
          data: {
            eventType: 'USER_UPDATED',
            userId: user.id,
            result: 'success',
          },
        });

        return user;
      });
    } catch (error: unknown) {
      this.rethrowDatabaseError(error);
    }
  }

  async updateStatus(
    id: string,
    dto: UpdateUserStatusDto,
  ): Promise<UserResponse> {
    const status =
      dto.status === 'ACTIVE' ? UserStatus.ACTIVE : UserStatus.INACTIVE;

    try {
      return await this.authPrisma.$transaction(async (transaction) => {
        const user = await transaction.user.update({
          where: { id },
          data: { status },
          select: USER_SELECT,
        });

        if (status === UserStatus.INACTIVE) {
          await transaction.centralSession.updateMany({
            where: { userId: id, status: SessionStatus.ACTIVE },
            data: {
              status: SessionStatus.REVOKED,
              revokedAt: new Date(),
              revokeReason: 'user_inactive',
            },
          });
        }

        await transaction.auditLog.create({
          data: {
            eventType: 'USER_STATUS_CHANGED',
            userId: user.id,
            result: 'success',
            metadata: { status },
          },
        });

        return user;
      });
    } catch (error: unknown) {
      this.rethrowDatabaseError(error);
    }
  }

  async changePassword(
    id: string,
    dto: ChangePasswordDto,
  ): Promise<UserResponse> {
    const passwordHash = await this.passwordService.hash(dto.password);
    const changedAt = new Date();

    try {
      return await this.authPrisma.$transaction(async (transaction) => {
        const user = await transaction.user.update({
          where: { id },
          data: { passwordHash, passwordChangedAt: changedAt },
          select: USER_SELECT,
        });

        await transaction.centralSession.updateMany({
          where: { userId: id, status: SessionStatus.ACTIVE },
          data: {
            status: SessionStatus.REVOKED,
            revokedAt: changedAt,
            revokeReason: 'password_changed',
          },
        });

        await transaction.auditLog.create({
          data: {
            eventType: 'PASSWORD_CHANGED',
            userId: user.id,
            result: 'success',
          },
        });

        return user;
      });
    } catch (error: unknown) {
      this.rethrowDatabaseError(error);
    }
  }

  private rethrowDatabaseError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException('Email sudah digunakan');
      }

      if (error.code === 'P2025') {
        throw new NotFoundException('User tidak ditemukan');
      }
    }

    throw error;
  }
}
