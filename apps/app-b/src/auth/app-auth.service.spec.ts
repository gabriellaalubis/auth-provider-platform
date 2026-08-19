import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppBPrismaService, LocalSessionStatus } from '@app/app-b-database';
import { createHash } from 'node:crypto';
import { AppAuthService } from './app-auth.service';

const NOW = new Date('2026-08-19T08:00:00.000Z');
const attempt = {
  id: '10000000-0000-4000-8000-000000000001',
  stateHash: createHash('sha256').update('state').digest('hex'),
  codeVerifier: 'v'.repeat(43),
  expiresAt: new Date(NOW.getTime() + 300_000),
  usedAt: null,
  createdAt: NOW,
};
const session = {
  id: '20000000-0000-4000-8000-000000000001',
  sessionTokenHash: createHash('sha256').update('token').digest('hex'),
  externalUserId: '30000000-0000-4000-8000-000000000001',
  centralSessionId: '40000000-0000-4000-8000-000000000001',
  status: LocalSessionStatus.ACTIVE,
  createdAt: NOW,
  expiresAt: new Date(NOW.getTime() + 60_000),
  lastActivityAt: null,
  revokedAt: null,
  revokeReason: null,
};

describe('AppAuthService App B', () => {
  const oAuthLoginAttempt = {
    create: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
  };
  const localSession = {
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
  };
  const profileCache = { findUnique: jest.fn(), upsert: jest.fn() };
  const activityLog = { create: jest.fn(), createMany: jest.fn() };
  const transaction = { localSession, profileCache, activityLog };
  const prisma = {
    oAuthLoginAttempt,
    localSession,
    profileCache,
    activityLog,
    $transaction: jest.fn(
      async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  };
  const values: Record<string, string | number> = {
    AUTH_SERVER_PUBLIC_URL: 'http://localhost:3000',
    AUTH_SERVER_INTERNAL_URL: 'http://auth-server:3000',
    APP_B_CLIENT_ID: 'app-b',
    APP_B_CLIENT_SECRET: 'b'.repeat(32),
    APP_B_REDIRECT_URI: 'http://localhost:4002/callback',
    LOCAL_SESSION_TTL_SECONDS: 28800,
    OAUTH_LOGIN_ATTEMPT_TTL_SECONDS: 300,
  };
  const config = {
    getOrThrow: jest.fn((name: string) => values[name]),
  };
  let service: AppAuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(NOW);
    oAuthLoginAttempt.create.mockResolvedValue(attempt);
    oAuthLoginAttempt.findUnique.mockResolvedValue(attempt);
    oAuthLoginAttempt.updateMany.mockResolvedValue({ count: 1 });
    localSession.findUnique.mockResolvedValue(session);
    localSession.update.mockResolvedValue(session);
    localSession.updateMany.mockResolvedValue({ count: 1 });
    profileCache.findUnique.mockResolvedValue({
      externalUserId: session.externalUserId,
      name: 'App B User',
      email: 'b@example.com',
      groups: ['app-b-users'],
      syncedAt: NOW,
    });
    service = new AppAuthService(
      prisma as unknown as AppBPrismaService,
      config as unknown as ConfigService,
    );
  });

  afterEach(() => jest.useRealTimers());

  it('builds an App B authorize request and stores a state hash', async () => {
    let storedHash: string | undefined;
    oAuthLoginAttempt.create.mockImplementationOnce(
      (input: { data: { stateHash: string } }) => {
        storedHash = input.data.stateHash;
        return Promise.resolve(attempt);
      },
    );
    const result = await service.beginLogin();
    const url = new URL(result.authorizeUrl);
    expect(url.searchParams.get('client_id')).toBe('app-b');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:4002/callback',
    );
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(storedHash).toHaveLength(64);
    expect(storedHash).not.toBe(url.searchParams.get('state'));
  });

  it('rejects an invalid state before calling the token endpoint', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    await expect(
      service.completeCallback(attempt.id, 'c'.repeat(43), 'wrong'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('returns a safe view for an active App B session', async () => {
    const result = await service.readLocalSession('token');
    expect(result?.user.email).toBe('b@example.com');
    expect(JSON.stringify(result)).not.toContain('sessionTokenHash');
  });

  it('expires a local session after its deadline', async () => {
    localSession.findUnique.mockResolvedValueOnce({
      ...session,
      expiresAt: new Date(NOW.getTime() - 1),
    });
    await expect(service.readLocalSession('token')).resolves.toBeNull();
    expect(localSession.updateMany).toHaveBeenCalledWith({
      where: { id: session.id, status: LocalSessionStatus.ACTIVE },
      data: { status: LocalSessionStatus.EXPIRED },
    });
  });

  it('revokes only the App B local session', async () => {
    await service.revokeLocalSession('token');
    expect(localSession.updateMany).toHaveBeenCalledWith({
      where: {
        sessionTokenHash: createHash('sha256').update('token').digest('hex'),
        status: LocalSessionStatus.ACTIVE,
      },
      data: {
        status: LocalSessionStatus.REVOKED,
        revokedAt: NOW,
        revokeReason: 'local_logout',
      },
    });
  });
});
