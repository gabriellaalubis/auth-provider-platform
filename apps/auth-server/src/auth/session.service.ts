import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuthPrismaService,
  SessionStatus,
  UserStatus,
} from '@app/auth-database';
import type {
  AuthResponse,
  CentralSessionResponse,
  UserResponse,
} from '@app/contracts';
import { createHash, randomBytes } from 'node:crypto';

interface CreatedSession {
  token: string;
  auth: AuthResponse;
}

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
export class SessionService {
  constructor(
    private readonly authPrisma: AuthPrismaService,
    private readonly configService: ConfigService,
  ) {}

  async create(user: UserResponse): Promise<CreatedSession> {
    const token = randomBytes(32).toString('base64url');
    const sessionTokenHash = this.hashToken(token);
    const ttlSeconds = this.configService.getOrThrow<number>(
      'SESSION_TTL_SECONDS',
    );
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    const session = await this.authPrisma.$transaction(async (transaction) => {
      const created = await transaction.centralSession.create({
        data: {
          sessionTokenHash,
          userId: user.id,
          expiresAt,
        },
      });

      await transaction.auditLog.create({
        data: {
          eventType: 'LOGIN_SUCCEEDED',
          userId: user.id,
          sessionId: created.id,
          result: 'success',
        },
      });

      return created;
    });

    return {
      token,
      auth: {
        user,
        session: this.toSessionResponse(session),
      },
    };
  }

  async getValidSession(token: string): Promise<AuthResponse | null> {
    const session = await this.authPrisma.centralSession.findUnique({
      where: { sessionTokenHash: this.hashToken(token) },
      include: { user: { select: USER_SELECT } },
    });

    if (!session) {
      return null;
    }

    if (
      session.status === SessionStatus.ACTIVE &&
      session.expiresAt <= new Date()
    ) {
      await this.authPrisma.centralSession.updateMany({
        where: { id: session.id, status: SessionStatus.ACTIVE },
        data: { status: SessionStatus.EXPIRED },
      });
      return null;
    }

    if (
      session.status !== SessionStatus.ACTIVE ||
      session.revokedAt !== null ||
      session.user.status !== UserStatus.ACTIVE
    ) {
      return null;
    }

    return {
      user: session.user,
      session: this.toSessionResponse(session),
    };
  }

  async revoke(token: string): Promise<void> {
    const sessionTokenHash = this.hashToken(token);
    const session = await this.authPrisma.centralSession.findUnique({
      where: { sessionTokenHash },
    });

    if (!session || session.status !== SessionStatus.ACTIVE) {
      return;
    }

    const revokedAt = new Date();
    await this.authPrisma.$transaction(async (transaction) => {
      const result = await transaction.centralSession.updateMany({
        where: { id: session.id, status: SessionStatus.ACTIVE },
        data: {
          status: SessionStatus.REVOKED,
          revokedAt,
          revokeReason: 'central_logout',
        },
      });

      if (result.count > 0) {
        await transaction.auditLog.create({
          data: {
            eventType: 'LOGOUT',
            userId: session.userId,
            sessionId: session.id,
            result: 'success',
          },
        });
      }
    });
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private toSessionResponse(session: {
    id: string;
    status: SessionStatus;
    createdAt: Date;
    expiresAt: Date;
  }): CentralSessionResponse {
    return {
      id: session.id,
      status: 'ACTIVE',
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    };
  }
}
