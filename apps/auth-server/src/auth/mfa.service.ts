import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthPrismaService } from '@app/auth-database';
import type { UserResponse } from '@app/contracts';
import { TokenService } from '@app/security';
import { randomBytes } from 'node:crypto';
import { SessionService } from './session.service';
import { TotpService } from './totp.service';

const MFA_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  status: true,
  passwordChangedAt: true,
  createdAt: true,
  updatedAt: true,
  mfaSecretEncrypted: true,
  mfaEnabledAt: true,
} as const;

export interface MfaRequiredResponse {
  mfaRequired: true;
  mfaToken: string;
  expiresIn: number;
}

@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: AuthPrismaService,
    private readonly config: ConfigService,
    private readonly tokenService: TokenService,
    private readonly totp: TotpService,
    private readonly sessions: SessionService,
  ) {}

  async getStatus(userId: string): Promise<{
    enabled: boolean;
    recoveryCodesRemaining: number;
  }> {
    const [user, recoveryCodesRemaining] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { mfaEnabledAt: true },
      }),
      this.prisma.mfaRecoveryCode.count({
        where: { userId, usedAt: null },
      }),
    ]);
    return {
      enabled: user.mfaEnabledAt !== null,
      recoveryCodesRemaining,
    };
  }

  async beginEnrollment(
    userId: string,
    email: string,
  ): Promise<{
    secret: string;
    provisioningUri: string;
  }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { mfaEnabledAt: true },
    });
    if (user.mfaEnabledAt) {
      throw new ConflictException(
        'Multi-factor authentication is already enabled',
      );
    }
    const secret = this.totp.generateSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecretEncrypted: this.totp.encryptSecret(secret) },
    });
    return {
      secret,
      provisioningUri: this.totp.createProvisioningUri(email, secret),
    };
  }

  async confirmEnrollment(userId: string, code: string): Promise<string[]> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { mfaSecretEncrypted: true, mfaEnabledAt: true },
    });
    if (user.mfaEnabledAt) {
      throw new ConflictException(
        'Multi-factor authentication is already enabled',
      );
    }
    if (!user.mfaSecretEncrypted) {
      throw new BadRequestException('Start MFA setup before verifying a code');
    }
    const secret = this.totp.decryptSecret(user.mfaSecretEncrypted);
    if (!this.totp.verifyCode(secret, code.trim())) {
      throw new BadRequestException('The verification code is incorrect');
    }
    const recoveryCodes = Array.from({ length: 8 }, () =>
      this.generateRecoveryCode(),
    );
    await this.prisma.$transaction(async (transaction) => {
      await transaction.mfaRecoveryCode.deleteMany({ where: { userId } });
      await transaction.mfaRecoveryCode.createMany({
        data: recoveryCodes.map((recoveryCode) => ({
          userId,
          codeHash: this.tokenService.hash(recoveryCode),
        })),
      });
      await transaction.user.update({
        where: { id: userId },
        data: { mfaEnabledAt: new Date() },
      });
      await transaction.auditLog.create({
        data: { eventType: 'mfa_enrolled', userId, result: 'success' },
      });
    });
    return recoveryCodes;
  }

  async beginLogin(userId: string): Promise<MfaRequiredResponse> {
    const token = this.tokenService.generateOpaqueToken();
    const ttlSeconds = this.config.getOrThrow<number>(
      'MFA_CHALLENGE_TTL_SECONDS',
    );
    await this.prisma.mfaLoginChallenge.create({
      data: {
        tokenHash: this.tokenService.hash(token),
        userId,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      },
    });
    return { mfaRequired: true, mfaToken: token, expiresIn: ttlSeconds };
  }

  async completeLogin(mfaToken: string, submittedCode: string) {
    const challenge = await this.prisma.mfaLoginChallenge.findUnique({
      where: { tokenHash: this.tokenService.hash(mfaToken) },
      include: { user: { select: MFA_USER_SELECT } },
    });
    const now = new Date();
    if (
      !challenge ||
      challenge.usedAt ||
      challenge.expiresAt <= now ||
      challenge.attemptCount >= 5 ||
      challenge.user.status !== 'ACTIVE' ||
      !challenge.user.mfaEnabledAt ||
      !challenge.user.mfaSecretEncrypted
    ) {
      throw new UnauthorizedException(
        'The MFA challenge is invalid or expired',
      );
    }
    const code = submittedCode.trim().toUpperCase();
    const isTotp = /^\d{6}$/.test(code);
    const validTotp =
      isTotp &&
      this.totp.verifyCode(
        this.totp.decryptSecret(challenge.user.mfaSecretEncrypted),
        code,
      );
    const recoveryHash = isTotp ? null : this.tokenService.hash(code);
    const recoveryCode = recoveryHash
      ? await this.prisma.mfaRecoveryCode.findUnique({
          where: {
            userId_codeHash: {
              userId: challenge.userId,
              codeHash: recoveryHash,
            },
          },
        })
      : null;
    const validRecovery = recoveryCode !== null && recoveryCode.usedAt === null;

    if (!validTotp && !validRecovery) {
      await this.recordFailure(
        challenge.id,
        challenge.userId,
        challenge.attemptCount,
      );
      throw new UnauthorizedException('The authentication code is incorrect');
    }

    await this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.mfaLoginChallenge.updateMany({
        where: { id: challenge.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) {
        throw new UnauthorizedException(
          'The MFA challenge is invalid or expired',
        );
      }
      if (recoveryHash) {
        const consumed = await transaction.mfaRecoveryCode.updateMany({
          where: {
            userId: challenge.userId,
            codeHash: recoveryHash,
            usedAt: null,
          },
          data: { usedAt: now },
        });
        if (consumed.count !== 1) {
          throw new UnauthorizedException(
            'The recovery code is invalid or already used',
          );
        }
      }
      await transaction.auditLog.create({
        data: {
          eventType: 'mfa_success',
          userId: challenge.userId,
          result: 'success',
        },
      });
    });

    return this.sessions.create(this.toSafeUser(challenge.user));
  }

  private async recordFailure(
    challengeId: string,
    userId: string,
    previousAttempts: number,
  ): Promise<void> {
    const attemptCount = previousAttempts + 1;
    await this.prisma.$transaction([
      this.prisma.mfaLoginChallenge.update({
        where: { id: challengeId },
        data: {
          attemptCount,
          ...(attemptCount >= 5 && { usedAt: new Date() }),
        },
      }),
      this.prisma.auditLog.create({
        data: { eventType: 'mfa_failed', userId, result: 'failed' },
      }),
    ]);
  }

  private generateRecoveryCode(): string {
    const compact = randomBytes(8).toString('hex').toUpperCase();
    return compact.match(/.{4}/g)?.join('-') ?? compact;
  }

  private toSafeUser(user: {
    id: string;
    name: string;
    email: string;
    status: 'ACTIVE' | 'INACTIVE';
    passwordChangedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): UserResponse {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      status: user.status,
      passwordChangedAt: user.passwordChangedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
