import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppAPrismaService, LocalSessionStatus } from '@app/app-a-database';
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
    private readonly prisma: AppAPrismaService,
    private readonly config: ConfigService,
  ) {}

  async beginLogin(): Promise<StartedLogin> {
    const state = randomBytes(32).toString('base64url');
    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256')
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
    const authorizeUrl = new URL(
      '/oauth/authorize',
      this.config.getOrThrow<string>('AUTH_SERVER_PUBLIC_URL'),
    );
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set(
      'client_id',
      this.config.getOrThrow<string>('APP_A_CLIENT_ID'),
    );
    authorizeUrl.searchParams.set(
      'redirect_uri',
      this.config.getOrThrow<string>('APP_A_REDIRECT_URI'),
    );
    authorizeUrl.searchParams.set('state', state);
    authorizeUrl.searchParams.set('code_challenge', codeChallenge);
    authorizeUrl.searchParams.set('code_challenge_method', 'S256');
    await this.prisma.activityLog.create({
      data: {
        eventType: 'OAUTH_REDIRECT_STARTED',
        message: 'Redirected to the identity provider',
        correlationId: attempt.id,
      },
    });
    return { attemptId: attempt.id, authorizeUrl: authorizeUrl.toString() };
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
    if (consumed.count !== 1) {
      throw invalid;
    }

    const token = await this.exchangeCode(code, attempt.codeVerifier);
    const userInfo = await this.fetchUserInfo(token.access_token);
    const localToken = randomBytes(32).toString('base64url');
    const ttl = this.config.getOrThrow<number>('LOCAL_SESSION_TTL_SECONDS');
    await this.prisma.$transaction(async (transaction) => {
      await transaction.profileCache.upsert({
        where: { externalUserId: userInfo.sub },
        create: {
          externalUserId: userInfo.sub,
          name: userInfo.name,
          email: userInfo.email,
          groups: userInfo.groups,
          syncedAt: now,
        },
        update: {
          name: userInfo.name,
          email: userInfo.email,
          groups: userInfo.groups,
          syncedAt: now,
        },
      });
      await transaction.localSession.create({
        data: {
          sessionTokenHash: this.hash(localToken),
          externalUserId: userInfo.sub,
          centralSessionId: userInfo.centralSessionId,
          expiresAt: new Date(now.getTime() + ttl * 1000),
        },
      });
      await transaction.activityLog.create({
        data: {
          eventType: 'AUTHORIZATION_CALLBACK_RECEIVED',
          message: 'Authorization callback received',
          correlationId: attempt.id,
        },
      });
      await transaction.activityLog.create({
        data: {
          eventType: 'USERINFO_FETCHED',
          message: 'User profile fetched from the identity provider',
          correlationId: attempt.id,
        },
      });
      await transaction.activityLog.create({
        data: {
          eventType: 'LOCAL_SESSION_CREATED',
          message: 'Local session created',
          correlationId: attempt.id,
        },
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
      const revoked = await transaction.localSession.updateMany({
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
      if (revoked.count === 1) {
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
    codeVerifier: string,
  ): Promise<TokenResponse> {
    const url = new URL(
      '/oauth/token',
      this.config.getOrThrow<string>('AUTH_SERVER_INTERNAL_URL'),
    );
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.config.getOrThrow<string>('APP_A_REDIRECT_URI'),
        client_id: this.config.getOrThrow<string>('APP_A_CLIENT_ID'),
        client_secret: this.config.getOrThrow<string>('APP_A_CLIENT_SECRET'),
        code_verifier: codeVerifier,
      }),
    });
    if (!response.ok) {
      throw new UnauthorizedException('Sign-in failed');
    }
    const value: unknown = await response.json();
    if (!this.isTokenResponse(value)) {
      throw new UnauthorizedException('Sign-in failed');
    }
    return value;
  }

  private async fetchUserInfo(accessToken: string): Promise<UserInfoResponse> {
    const url = new URL(
      '/oauth/userinfo',
      this.config.getOrThrow<string>('AUTH_SERVER_INTERNAL_URL'),
    );
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw new UnauthorizedException('Sign-in failed');
    }
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
    const leftBuffer = Buffer.from(left, 'hex');
    const rightBuffer = Buffer.from(right, 'hex');
    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  }

  private isTokenResponse(value: unknown): value is TokenResponse {
    if (typeof value !== 'object' || value === null) return false;
    const record = value as Record<string, unknown>;
    return (
      typeof record.access_token === 'string' &&
      record.token_type === 'Bearer' &&
      typeof record.expires_in === 'number'
    );
  }

  private isUserInfoResponse(value: unknown): value is UserInfoResponse {
    if (typeof value !== 'object' || value === null) return false;
    const record = value as Record<string, unknown>;
    return (
      typeof record.sub === 'string' &&
      typeof record.name === 'string' &&
      typeof record.email === 'string' &&
      Array.isArray(record.groups) &&
      record.groups.every((group) => typeof group === 'string') &&
      typeof record.centralSessionId === 'string'
    );
  }

  private readGroups(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((group): group is string => typeof group === 'string')
      : [];
  }
}
