import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  ApplicationStatus,
  AuthPrismaService,
  UserStatus,
} from '@app/auth-database';
import { createHash } from 'node:crypto';

export interface AllowedPolicy {
  applicationId: string;
  userId: string;
  clientId: string;
  redirectUri: string;
}

@Injectable()
export class PolicyEvaluatorService {
  constructor(private readonly authPrisma: AuthPrismaService) {}

  async evaluate(
    userId: string,
    clientId: string,
    redirectUri: string,
  ): Promise<AllowedPolicy> {
    const redirectUriHash = createHash('sha256')
      .update(redirectUri)
      .digest('hex');

    const [user, application] = await Promise.all([
      this.authPrisma.user.findUnique({
        where: { id: userId },
        select: { id: true, status: true },
      }),
      this.authPrisma.application.findUnique({
        where: { clientId },
        include: {
          redirectUris: {
            where: { redirectUriHash, redirectUri },
            select: { id: true },
          },
          groups: {
            where: { group: { users: { some: { userId } } } },
            select: { groupId: true },
          },
        },
      }),
    ]);

    if (
      !user ||
      !application ||
      user.status !== UserStatus.ACTIVE ||
      application.status !== ApplicationStatus.ACTIVE ||
      application.redirectUris.length === 0 ||
      application.groups.length === 0
    ) {
      await this.authPrisma.auditLog.create({
        data: {
          eventType: 'POLICY_DENIED',
          userId: user?.id,
          applicationId: application?.id,
          result: 'failed',
          metadata: { clientId },
        },
      });
      throw new ForbiddenException('Akses ke aplikasi ditolak');
    }

    return {
      applicationId: application.id,
      userId: user.id,
      clientId: application.clientId,
      redirectUri,
    };
  }
}
