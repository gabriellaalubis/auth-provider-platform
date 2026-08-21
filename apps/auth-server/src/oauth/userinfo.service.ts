import { Injectable, UnauthorizedException } from '@nestjs/common';
import {
  AccessTokenStatus,
  ApplicationStatus,
  AuthPrismaService,
  SessionStatus,
  UserStatus,
} from '@app/auth-database';
import type { UserInfoResponse } from '@app/contracts';
import { TokenService } from '@app/security';

@Injectable()
export class UserInfoService {
  constructor(
    private readonly authPrisma: AuthPrismaService,
    private readonly tokenService: TokenService,
  ) {}

  async getProfile(rawToken: string): Promise<UserInfoResponse> {
    const tokenHash = this.tokenService.hash(rawToken);
    const accessToken = await this.authPrisma.accessToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            groups: {
              include: { group: true },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
        application: true,
        centralSession: true,
      },
    });
    const now = new Date();

    if (
      !accessToken ||
      accessToken.status !== AccessTokenStatus.ACTIVE ||
      accessToken.revokedAt !== null ||
      accessToken.expiresAt <= now ||
      accessToken.user.status !== UserStatus.ACTIVE ||
      accessToken.application.status !== ApplicationStatus.ACTIVE ||
      accessToken.centralSession.status !== SessionStatus.ACTIVE ||
      accessToken.centralSession.revokedAt !== null ||
      accessToken.centralSession.expiresAt <= now
    ) {
      throw new UnauthorizedException('The access token is invalid');
    }

    return {
      sub: accessToken.user.id,
      name: accessToken.user.name,
      email: accessToken.user.email,
      groups: accessToken.user.groups.map(
        (membership) => membership.group.name,
      ),
      centralSessionId: accessToken.centralSessionId,
    };
  }
}
