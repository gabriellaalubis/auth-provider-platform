import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppAPrismaService, LocalSessionStatus } from '@app/app-a-database';
import { createHash } from 'node:crypto';
import { AppAuthService } from './app-auth.service';

const NOW = new Date('2026-08-18T08:00:00.000Z');

const ATTEMPT = {
  id: '10000000-0000-4000-8000-000000000001',
  stateHash: createHash('sha256').update('correct-state').digest('hex'),
  codeVerifier: 'v'.repeat(43),
  expiresAt: new Date('2026-08-18T08:05:00.000Z'),
  usedAt: null,
  createdAt: NOW,
};

const SESSION = {
  id: '20000000-0000-4000-8000-000000000001',
  sessionTokenHash: createHash('sha256').update('local-token').digest('hex'),
  externalUserId: '30000000-0000-4000-8000-000000000001',
  centralSessionId: '40000000-0000-4000-8000-000000000001',
  status: LocalSessionStatus.ACTIVE,
  createdAt: NOW,
  expiresAt: new Date('2026-08-18T10:00:00.000Z'),
  lastActivityAt: null,
  revokedAt: null,
  revokeReason: null,
};

const PROFILE = {
  externalUserId: SESSION.externalUserId,
  name: 'Test User',
  email: 'test@example.com',
  groups: ['app-a-users'],
  syncedAt: NOW,
  createdAt: NOW,
  updatedAt: NOW,
};

describe('AppAuthService App A', () => {
  const oAuthLoginAttempt = {
    create: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
  };
  const profileCache = {
    upsert: jest.fn(),
    findUnique: jest.fn(),
  };
  const localSession = {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  };
  const activityLog = { create: jest.fn() };
  const transaction = { profileCache, localSession, activityLog };
  const prisma = {
    oAuthLoginAttempt,
    profileCache,
    localSession,
    activityLog,
    $transaction: jest.fn(
      async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  };
  const environment: Record<string, string | number | boolean> = {
    AUTH_SERVER_PUBLIC_URL: 'http://localhost:3000',
    AUTH_SERVER_INTERNAL_URL: 'http://auth-server:3000',
    APP_A_CLIENT_ID: 'app-a',
    APP_A_CLIENT_SECRET: 'a'.repeat(32),
    APP_A_REDIRECT_URI: 'http://localhost:4001/callback',
    APP_A_LOCAL_SESSION_COOKIE_NAME: 'app_a_session',
    LOCAL_SESSION_TTL_SECONDS: 28800,
    OAUTH_LOGIN_ATTEMPT_TTL_SECONDS: 300,
    SESSION_COOKIE_SECURE: false,
  };
  const config = {
    getOrThrow: jest.fn((name: string): string | number | boolean => {
      const value = environment[name];
      if (value === undefined) throw new Error(`Missing config: ${name}`);
      return value;
    }),
  };
  let service: AppAuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(NOW);
    oAuthLoginAttempt.create.mockResolvedValue(ATTEMPT);
    oAuthLoginAttempt.findUnique.mockResolvedValue(ATTEMPT);
    oAuthLoginAttempt.updateMany.mockResolvedValue({ count: 1 });
    profileCache.upsert.mockResolvedValue(PROFILE);
    profileCache.findUnique.mockResolvedValue(PROFILE);
    localSession.create.mockResolvedValue(SESSION);
    localSession.findUnique.mockResolvedValue(SESSION);
    localSession.update.mockResolvedValue(SESSION);
    localSession.updateMany.mockResolvedValue({ count: 1 });
    activityLog.create.mockResolvedValue({ id: 'log-id' });
    service = new AppAuthService(
      prisma as unknown as AppAPrismaService,
      config as unknown as ConfigService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('membuat authorize URL dan hanya menyimpan hash state', async () => {
    let storedStateHash: string | undefined;
    oAuthLoginAttempt.create.mockImplementationOnce(
      (input: { data: { stateHash: string } }) => {
        storedStateHash = input.data.stateHash;
        return Promise.resolve(ATTEMPT);
      },
    );

    const result = await service.beginLogin();
    const url = new URL(result.authorizeUrl);
    const rawState = url.searchParams.get('state');

    expect(url.origin).toBe('http://localhost:3000');
    expect(url.pathname).toBe('/oauth/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('app-a');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:4001/callback',
    );
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toHaveLength(43);
    expect(rawState).toHaveLength(43);
    expect(storedStateHash).toHaveLength(64);
    expect(storedStateHash).not.toBe(rawState);
  });

  it.each([
    ['tidak ditemukan', null],
    ['sudah dipakai', { ...ATTEMPT, usedAt: NOW }],
    ['kedaluwarsa', { ...ATTEMPT, expiresAt: new Date(NOW.getTime() - 1) }],
  ])('menolak attempt yang %s', async (_name, attempt) => {
    oAuthLoginAttempt.findUnique.mockResolvedValueOnce(attempt);

    await expect(
      service.completeCallback(ATTEMPT.id, 'c'.repeat(43), 'correct-state'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('menolak state yang tidak cocok', async () => {
    await expect(
      service.completeCallback(ATTEMPT.id, 'c'.repeat(43), 'wrong-state'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('menolak callback replay secara atomik', async () => {
    oAuthLoginAttempt.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.completeCallback(ATTEMPT.id, 'c'.repeat(43), 'correct-state'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(oAuthLoginAttempt.updateMany).toHaveBeenCalledWith({
      where: {
        id: ATTEMPT.id,
        usedAt: null,
        expiresAt: { gt: NOW },
      },
      data: { usedAt: NOW },
    });
  });

  it('menukar code, mengambil profil, lalu menyimpan hash local token', async () => {
    let storedSessionData: Record<string, unknown> | undefined;
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'access-token',
            token_type: 'Bearer',
            expires_in: 900,
          }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            sub: SESSION.externalUserId,
            name: PROFILE.name,
            email: PROFILE.email,
            groups: PROFILE.groups,
            centralSessionId: SESSION.centralSessionId,
          }),
      } as Response);
    localSession.create.mockImplementationOnce(
      (input: { data: Record<string, unknown> }) => {
        storedSessionData = input.data;
        return Promise.resolve(SESSION);
      },
    );

    const localToken = await service.completeCallback(
      ATTEMPT.id,
      'c'.repeat(43),
      'correct-state',
    );
    const firstFetchOptions: unknown = fetchMock.mock.calls[0]?.[1];
    if (typeof firstFetchOptions !== 'object' || firstFetchOptions === null) {
      throw new Error('Token request options tidak tersedia');
    }
    const body = (firstFetchOptions as { body?: unknown }).body;
    if (typeof body !== 'string') throw new Error('Token body bukan string');
    const tokenRequestBody: unknown = JSON.parse(body);

    expect(tokenRequestBody).toEqual({
      grant_type: 'authorization_code',
      code: 'c'.repeat(43),
      redirect_uri: 'http://localhost:4001/callback',
      client_id: 'app-a',
      client_secret: 'a'.repeat(32),
      code_verifier: ATTEMPT.codeVerifier,
    });
    expect(fetchMock.mock.calls[1]?.[1]).toEqual({
      headers: { authorization: 'Bearer access-token' },
    });
    expect(localToken).toHaveLength(43);
    expect(storedSessionData?.sessionTokenHash).toHaveLength(64);
    expect(storedSessionData?.sessionTokenHash).not.toBe(localToken);
    expect(JSON.stringify(storedSessionData)).not.toContain('access-token');
  });

  it('menandai session kedaluwarsa lalu menolaknya', async () => {
    localSession.findUnique.mockResolvedValueOnce({
      ...SESSION,
      expiresAt: new Date(NOW.getTime() - 1),
    });

    await expect(service.readLocalSession('local-token')).resolves.toBeNull();
    expect(localSession.updateMany).toHaveBeenCalledWith({
      where: { id: SESSION.id, status: LocalSessionStatus.ACTIVE },
      data: { status: LocalSessionStatus.EXPIRED },
    });
  });

  it('mengembalikan session valid tanpa credential atau hash', async () => {
    const result = await service.readLocalSession('local-token');

    expect(result?.user).toEqual({
      id: PROFILE.externalUserId,
      name: PROFILE.name,
      email: PROFILE.email,
      groups: PROFILE.groups,
      syncedAt: PROFILE.syncedAt,
    });
    expect(JSON.stringify(result)).not.toContain('sessionTokenHash');
    expect(JSON.stringify(result)).not.toContain('password');
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('mencabut hanya local session secara idempotent', async () => {
    let revokeData: Record<string, unknown> | undefined;
    localSession.updateMany.mockImplementationOnce(
      (input: { data: Record<string, unknown> }) => {
        revokeData = input.data;
        return Promise.resolve({ count: 1 });
      },
    );

    await service.revokeLocalSession('local-token');
    await expect(
      service.revokeLocalSession(undefined),
    ).resolves.toBeUndefined();

    expect(revokeData).toMatchObject({
      status: LocalSessionStatus.REVOKED,
      revokedAt: NOW,
      revokeReason: 'local_logout',
    });
  });
});
