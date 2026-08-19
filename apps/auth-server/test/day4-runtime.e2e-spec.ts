import { AppAPrismaService } from '@app/app-a-database';
import { AppBPrismaService } from '@app/app-b-database';
import { AuthPrismaService } from '@app/auth-database';
import { PasswordService } from '@app/security';
import { createHash, randomUUID } from 'node:crypto';

type StartedFlow = {
  attemptId: string;
  localCookie: string;
  localToken: string;
};

describe('Day 4 SSO runtime', () => {
  const authPrisma = new AuthPrismaService();
  const appAPrisma = new AppAPrismaService();
  const appBPrisma = new AppBPrismaService();
  const passwordService = new PasswordService();
  const email = `day4-${randomUUID()}@example.com`;
  const password = 'day4-e2e-password-yang-aman';
  const startedAt = new Date();
  let userId = '';
  let appAFlow: StartedFlow | undefined;
  let appBFlow: StartedFlow | undefined;

  beforeAll(async () => {
    await Promise.all([
      authPrisma.$connect(),
      appAPrisma.$connect(),
      appBPrisma.$connect(),
    ]);
    const user = await authPrisma.user.create({
      data: {
        name: 'Day 4 Runtime User',
        email,
        passwordHash: await passwordService.hash(password),
      },
    });
    userId = user.id;
    const groups = await authPrisma.group.findMany({
      where: { name: { in: ['app-a-users', 'app-b-users'] } },
    });
    if (groups.length !== 2) throw new Error('Seeded app groups are missing');
    await authPrisma.userGroup.createMany({
      data: groups.map((group) => ({ userId, groupId: group.id })),
    });
  });

  afterAll(async () => {
    if (userId) {
      await appAPrisma.localSession.deleteMany({
        where: { externalUserId: userId },
      });
      await appBPrisma.localSession.deleteMany({
        where: { externalUserId: userId },
      });
      await appAPrisma.profileCache.deleteMany({
        where: { externalUserId: userId },
      });
      await appBPrisma.profileCache.deleteMany({
        where: { externalUserId: userId },
      });
      if (appAFlow) {
        await appAPrisma.oAuthLoginAttempt.deleteMany({
          where: { id: appAFlow.attemptId },
        });
      }
      if (appBFlow) {
        await appBPrisma.oAuthLoginAttempt.deleteMany({
          where: { id: appBFlow.attemptId },
        });
      }
      await appAPrisma.activityLog.deleteMany({
        where: { createdAt: { gte: startedAt } },
      });
      await appBPrisma.activityLog.deleteMany({
        where: { createdAt: { gte: startedAt } },
      });
      await authPrisma.authorizationCode.deleteMany({ where: { userId } });
      await authPrisma.accessToken.deleteMany({ where: { userId } });
      await authPrisma.centralSession.deleteMany({ where: { userId } });
      await authPrisma.auditLog.deleteMany({ where: { userId } });
      await authPrisma.event.deleteMany({ where: { userId } });
      await authPrisma.userGroup.deleteMany({ where: { userId } });
      await authPrisma.user.deleteMany({ where: { id: userId } });
    }
    await Promise.all([
      authPrisma.$disconnect(),
      appAPrisma.$disconnect(),
      appBPrisma.$disconnect(),
    ]);
  });

  it('keeps App B and the central session active after local App A logout', async () => {
    const login = await fetch('http://auth-server:3000/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    expect(login.status).toBe(200);
    const centralCookie = namedCookie(login, 'central_session');

    appAFlow = await loginToApplication(
      'http://app-a:4001',
      centralCookie,
      'app_a_oauth_attempt',
      'app_a_session',
    );
    appBFlow = await loginToApplication(
      'http://app-b:4002',
      centralCookie,
      'app_b_oauth_attempt',
      'app_b_session',
    );

    const [appASession, appBSession] = await Promise.all([
      fetch('http://app-a:4001/api/session', {
        headers: { cookie: appAFlow.localCookie },
      }),
      fetch('http://app-b:4002/api/session', {
        headers: { cookie: appBFlow.localCookie },
      }),
    ]);
    expect(appASession.status).toBe(200);
    expect(appBSession.status).toBe(200);

    const appAStored = await appAPrisma.localSession.findUnique({
      where: { sessionTokenHash: hash(appAFlow.localToken) },
    });
    const appBStored = await appBPrisma.localSession.findUnique({
      where: { sessionTokenHash: hash(appBFlow.localToken) },
    });
    expect(appAStored?.sessionTokenHash).not.toBe(appAFlow.localToken);
    expect(appBStored?.sessionTokenHash).not.toBe(appBFlow.localToken);

    const logout = await fetch('http://app-a:4001/logout', {
      method: 'POST',
      headers: { cookie: appAFlow.localCookie },
    });
    expect(logout.status).toBe(204);
    const [oldAppA, activeAppB, activeCentral] = await Promise.all([
      fetch('http://app-a:4001/api/session', {
        headers: { cookie: appAFlow.localCookie },
      }),
      fetch('http://app-b:4002/api/session', {
        headers: { cookie: appBFlow.localCookie },
      }),
      fetch('http://auth-server:3000/auth/session', {
        headers: { cookie: centralCookie },
      }),
    ]);
    expect(oldAppA.status).toBe(401);
    expect(activeAppB.status).toBe(200);
    expect(activeCentral.status).toBe(200);
  });
});

async function loginToApplication(
  baseUrl: string,
  centralCookie: string,
  attemptCookieName: string,
  localCookieName: string,
): Promise<StartedFlow> {
  const start = await fetch(`${baseUrl}/login`, { redirect: 'manual' });
  expect(start.status).toBe(302);
  const attemptCookie = namedCookie(start, attemptCookieName);
  const attemptId = cookieValue(attemptCookie);
  const authorizeLocation = start.headers.get('location');
  if (!authorizeLocation) throw new Error('Authorize location is missing');
  const authorizeUrl = new URL(authorizeLocation);
  const authorize = await fetch(
    `http://auth-server:3000${authorizeUrl.pathname}${authorizeUrl.search}`,
    { headers: { cookie: centralCookie }, redirect: 'manual' },
  );
  expect(authorize.status).toBe(302);
  const callbackLocation = authorize.headers.get('location');
  if (!callbackLocation) throw new Error('Callback location is missing');
  const callbackUrl = new URL(callbackLocation);
  const callback = await fetch(
    `${baseUrl}${callbackUrl.pathname}${callbackUrl.search}`,
    { headers: { cookie: attemptCookie }, redirect: 'manual' },
  );
  expect(callback.status).toBe(302);
  const localCookie = namedCookie(callback, localCookieName);
  return { attemptId, localCookie, localToken: cookieValue(localCookie) };
}

function namedCookie(response: Response, name: string): string {
  const header = response.headers.get('set-cookie');
  if (!header) throw new Error('Set-Cookie header is missing');
  const start = header.indexOf(`${name}=`);
  if (start < 0) throw new Error(`Cookie ${name} is missing`);
  const end = header.indexOf(';', start);
  return header.slice(start, end < 0 ? undefined : end);
}

function cookieValue(cookie: string): string {
  const separator = cookie.indexOf('=');
  if (separator < 1) throw new Error('Cookie is invalid');
  return cookie.slice(separator + 1);
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
