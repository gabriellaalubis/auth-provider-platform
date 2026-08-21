import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import {
  AuthPrismaService,
  SessionStatus,
  UserStatus,
} from '@app/auth-database';
import { TokenService } from '@app/security';
import type { Request } from 'express';
import { PUBLIC_ROUTE_KEY } from './public-route.decorator';

@Injectable()
export class AdminAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: AuthPrismaService,
    private readonly config: ConfigService,
    private readonly tokens: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      PUBLIC_ROUTE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.readSessionToken(request);
    if (!token) {
      throw new UnauthorizedException('A central session is required');
    }

    const session = await this.prisma.centralSession.findUnique({
      where: { sessionTokenHash: this.tokens.hash(token) },
      select: {
        status: true,
        expiresAt: true,
        revokedAt: true,
        user: {
          select: {
            status: true,
            groups: {
              where: { group: { name: 'admin' } },
              select: { groupId: true },
              take: 1,
            },
          },
        },
      },
    });

    if (
      !session ||
      session.status !== SessionStatus.ACTIVE ||
      session.revokedAt !== null ||
      session.expiresAt <= new Date() ||
      session.user.status !== UserStatus.ACTIVE
    ) {
      throw new UnauthorizedException('The central session is invalid');
    }

    if (session.user.groups.length === 0) {
      throw new ForbiddenException(
        'You do not have permission to access the Control Panel',
      );
    }

    return true;
  }

  private readSessionToken(request: Request): string | undefined {
    const cookies: unknown = request.cookies;
    if (typeof cookies !== 'object' || cookies === null) return undefined;
    const cookieName = this.config.getOrThrow<string>('SESSION_COOKIE_NAME');
    const token = (cookies as Record<string, unknown>)[cookieName];
    return typeof token === 'string' ? token : undefined;
  }
}
