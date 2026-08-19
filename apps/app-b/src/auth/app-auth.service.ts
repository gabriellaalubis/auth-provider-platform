import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppBPrismaService, LocalSessionStatus } from '@app/app-b-database';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
}

interface UserInfoResponse {
  sub: string;
  name: string;
  email: string;
  groups: string[];
  centralSessionId: string;
}

export interface StartedLogin {
  attemptId: string;
  authorizeUrl: string;
}

export interface LocalSessionView {
  session: {
    id: string;
    status: LocalSessionStatus;
    createdAt: Date;
    expiresAt: Date;
    lastActivityAt: Date | null;
  };
  user: {
    id: string;
    name: string;
    email: string;
    groups: string[];
    syncedAt: Date;
  };
}

@Injectable()
export class AppAuthService {
  constructor(
    private readonly prisma: AppBPrismaService,
    private readonly config: ConfigService,
  ) {}

  async beginLogin(): Promise<StartedLogin> {
    const state = randomBytes(32).toString('base64url');
    const codeVerifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    const ttl = this.config.getOrThrow<number>(
      'OAUTH_LOGIN_ATTEMPT_TTL_SECONDS',
    );
    const attempt = await this.prisma.oAuthLoginAttempt.create({
      data: {
        stateHash: this.hash(state),
        codeVerifier,
        expiresAt: new Date(Date.now() + ttl * 1000),
      },
    });
    const url = new URL(
      '/oauth/authorize',
      this.config.getOrThrow<string>('AUTH_SERVER_PUBLIC_URL'),
    );
    url.searchParams.set('response_type', 'code');
    url.searchParams.set(
      'client_id',
      this.config.getOrThrow<string>('APP_B_CLIENT_ID'),
    );
    url.searchParams.set(
      'redirect_uri',
      this.config.getOrThrow<string>('APP_B_REDIRECT_URI'),
    );
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    await this.prisma.activityLog.create({
      data: {
        eventType: 'OAUTH_REDIRECT_STARTED',
        message: 'Redirected to the identity provider',
        correlationId: attempt.id,
      },
    });
    return { attemptId: attempt.id, authorizeUrl: url.toString() };
  }

  async completeCallback(
    attemptId: string,
    code: string,
    state: string,
  ): Promise<string> {
    const invalid = new UnauthorizedException(
      'The sign-in request is invalid or expired',
    );
    const now = new Date();
    const attempt = await this.prisma.oAuthLoginAttempt.findUnique({
      where: { id: attemptId },
    });
    if (
      !attempt ||
      attempt.usedAt !== null ||
      attempt.expiresAt <= now ||
      !this.equalHashes(attempt.stateHash, this.hash(state))
    ) {
      throw invalid;
    }
    const consumed = await this.prisma.oAuthLoginAttempt.updateMany({
      where: { id: attempt.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (consumed.count !== 1) throw invalid;

    const token = await this.exchangeCode(code, attempt.codeVerifier);
    const user = await this.fetchUserInfo(token.access_token);
    const localToken = randomBytes(32).toString('base64url');
    const ttl = this.config.getOrThrow<number>('LOCAL_SESSION_TTL_SECONDS');
    await this.prisma.$transaction(async (transaction) => {
      await transaction.profileCache.upsert({
        where: { externalUserId: user.sub },
        create: {
          externalUserId: user.sub,
          name: user.name,
          email: user.email,
          groups: user.groups,
          syncedAt: now,
        },
        update: {
          name: user.name,
          email: user.email,
          groups: user.groups,
          syncedAt: now,
        },
      });
      await transaction.localSession.create({
        data: {
          sessionTokenHash: this.hash(localToken),
          externalUserId: user.sub,
          centralSessionId: user.centralSessionId,
          expiresAt: new Date(now.getTime() + ttl * 1000),
        },
      });
      await transaction.activityLog.createMany({
        data: [
          {
            eventType: 'AUTHORIZATION_CALLBACK_RECEIVED',
            message: 'Authorization callback received',
            correlationId: attempt.id,
          },
          {
            eventType: 'USERINFO_FETCHED',
            message: 'User profile fetched from the identity provider',
            correlationId: attempt.id,
          },
          {
            eventType: 'LOCAL_SESSION_CREATED',
            message: 'Local session created',
            correlationId: attempt.id,
          },
        ],
      });
    });
    return localToken;
  }

  async readLocalSession(rawToken: string): Promise<LocalSessionView | null> {
    const session = await this.prisma.localSession.findUnique({
      where: { sessionTokenHash: this.hash(rawToken) },
    });
    if (!session) return null;
    const now = new Date();
    if (session.expiresAt <= now) {
      await this.prisma.localSession.updateMany({
        where: { id: session.id, status: LocalSessionStatus.ACTIVE },
        data: { status: LocalSessionStatus.EXPIRED },
      });
      return null;
    }
    if (
      session.status !== LocalSessionStatus.ACTIVE ||
      session.revokedAt !== null
    ) {
      return null;
    }
    const profile = await this.prisma.profileCache.findUnique({
      where: { externalUserId: session.externalUserId },
    });
    if (!profile) return null;
    await this.prisma.localSession.update({
      where: { id: session.id },
      data: { lastActivityAt: now },
    });
    return {
      session: {
        id: session.id,
        status: session.status,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        lastActivityAt: now,
      },
      user: {
        id: profile.externalUserId,
        name: profile.name,
        email: profile.email,
        groups: this.readGroups(profile.groups),
        syncedAt: profile.syncedAt,
      },
    };
  }

  async revokeLocalSession(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.localSession.updateMany({
        where: {
          sessionTokenHash: this.hash(rawToken),
          status: LocalSessionStatus.ACTIVE,
        },
        data: {
          status: LocalSessionStatus.REVOKED,
          revokedAt: now,
          revokeReason: 'local_logout',
        },
      });
      if (result.count === 1) {
        await transaction.activityLog.create({
          data: {
            eventType: 'LOCAL_LOGOUT',
            message: 'Local session ended',
          },
        });
      }
    });
  }

  private async exchangeCode(
    code: string,
    verifier: string,
  ): Promise<TokenResponse> {
    const response = await fetch(
      new URL(
        '/oauth/token',
        this.config.getOrThrow<string>('AUTH_SERVER_INTERNAL_URL'),
      ),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code,
          redirect_uri: this.config.getOrThrow<string>('APP_B_REDIRECT_URI'),
          client_id: this.config.getOrThrow<string>('APP_B_CLIENT_ID'),
          client_secret: this.config.getOrThrow<string>('APP_B_CLIENT_SECRET'),
          code_verifier: verifier,
        }),
      },
    );
    if (!response.ok) throw new UnauthorizedException('Sign-in failed');
    const value: unknown = await response.json();
    if (!this.isTokenResponse(value)) {
      throw new UnauthorizedException('Sign-in failed');
    }
    return value;
  }

  private async fetchUserInfo(accessToken: string): Promise<UserInfoResponse> {
    const response = await fetch(
      new URL(
        '/oauth/userinfo',
        this.config.getOrThrow<string>('AUTH_SERVER_INTERNAL_URL'),
      ),
      { headers: { authorization: `Bearer ${accessToken}` } },
    );
    if (!response.ok) throw new UnauthorizedException('Sign-in failed');
    const value: unknown = await response.json();
    if (!this.isUserInfoResponse(value)) {
      throw new UnauthorizedException('Sign-in failed');
    }
    return value;
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private equalHashes(left: string, right: string): boolean {
    const a = Buffer.from(left, 'hex');
    const b = Buffer.from(right, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private isTokenResponse(value: unknown): value is TokenResponse {
    if (typeof value !== 'object' || value === null) return false;
    const data = value as Record<string, unknown>;
    return (
      typeof data.access_token === 'string' &&
      data.token_type === 'Bearer' &&
      typeof data.expires_in === 'number'
    );
  }

  private isUserInfoResponse(value: unknown): value is UserInfoResponse {
    if (typeof value !== 'object' || value === null) return false;
    const data = value as Record<string, unknown>;
    return (
      typeof data.sub === 'string' &&
      typeof data.name === 'string' &&
      typeof data.email === 'string' &&
      Array.isArray(data.groups) &&
      data.groups.every((group) => typeof group === 'string') &&
      typeof data.centralSessionId === 'string'
    );
  }

  private readGroups(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((group): group is string => typeof group === 'string')
      : [];
  }
}
