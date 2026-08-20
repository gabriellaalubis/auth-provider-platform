import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthPrismaService } from '@app/auth-database';
import type { AuthResponse, ErrorResponse } from '@app/contracts';
import { PasswordService } from '@app/security';
import { StandardExceptionFilter } from '@app/shared';
import cookieParser from 'cookie-parser';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Auth central session (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: AuthPrismaService;
  const email = `e2e-auth-${randomUUID()}@example.com`;
  const password = 'e2e-auth-password-yang-aman';
  let userId = '';
  let appAGroupId = '';

  function createPkcePair(): { verifier: string; challenge: string } {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    return { verifier, challenge };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(new StandardExceptionFilter());
    await app.init();

    prisma = app.get(AuthPrismaService);
    const passwordService = app.get(PasswordService);
    const user = await prisma.user.create({
      data: {
        name: 'Auth E2E User',
        email,
        passwordHash: await passwordService.hash(password),
      },
    });
    userId = user.id;
    const group = await prisma.group.findUniqueOrThrow({
      where: { name: 'app-a-users' },
    });
    appAGroupId = group.id;
    await prisma.userGroup.create({
      data: { userId, groupId: appAGroupId },
    });
  });

  afterAll(async () => {
    if (userId) {
      await prisma.authorizationCode.deleteMany({ where: { userId } });
      await prisma.accessToken.deleteMany({ where: { userId } });
      await prisma.centralSession.deleteMany({ where: { userId } });
      await prisma.auditLog.deleteMany({ where: { userId } });
      await prisma.event.deleteMany({ where: { userId } });
      await prisma.userGroup.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await app.close();
  });

  it('membedakan liveness dan readiness', async () => {
    await request(app.getHttpServer())
      .get('/health/live')
      .expect(200)
      .expect({ status: 'live', service: 'auth-server' });

    const readiness = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200);
    expect(readiness.body).toEqual({
      status: 'ready',
      service: 'auth-server',
      components: {
        database: { status: 'up' },
        messageBroker: { status: 'up' },
      },
    });
  });

  it('menyediakan dashboard dan endpoint observability', async () => {
    const dashboard = await request(app.getHttpServer())
      .get('/metrics')
      .expect('Content-Type', /html/)
      .expect(200);
    expect(dashboard.text).toContain('System health at a glance');
    expect(dashboard.text).toContain("fetch('/metrics/data'");

    const data = await request(app.getHttpServer())
      .get('/metrics/data')
      .expect(200);
    expect(data.body).toMatchObject({
      generatedAt: expect.any(String) as string,
      uptimeSeconds: expect.any(Number) as number,
      http: {
        totalRequests: expect.any(Number) as number,
        requestsLastMinute: expect.any(Number) as number,
        totalErrors: expect.any(Number) as number,
        errorsLastMinute: expect.any(Number) as number,
        errorRatePercent: expect.any(Number) as number,
        averageLatencyMilliseconds: expect.any(Number) as number,
        p95LatencyMilliseconds: expect.any(Number) as number,
      },
      queues: {
        available: true,
        mainDepth: expect.any(Number) as number,
        retryDepth: expect.any(Number) as number,
        deadLetterDepth: expect.any(Number) as number,
        consumerCount: expect.any(Number) as number,
      },
    });

    const prometheus = await request(app.getHttpServer())
      .get('/metrics/prometheus')
      .expect('Content-Type', /text\/plain/)
      .expect(200);
    expect(prometheus.text).toContain('sso_http_requests_total');
    expect(prometheus.text).toContain(
      'sso_queue_messages{queue="dead_letter"}',
    );
  });

  it('memberi error generik untuk credential salah', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'password-yang-pasti-salah' })
      .expect(401);
    const body = response.body as unknown as ErrorResponse;

    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.message).not.toContain(email);
    expect(body.error.requestId).toBe(response.headers['x-request-id']);
  });

  it('login, membaca session, logout, lalu menolak cookie lama', async () => {
    const agent = request.agent(app.getHttpServer());
    const loginResponse = await agent
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    const loginBody = loginResponse.body as unknown as AuthResponse;

    expect(loginBody.user.email).toBe(email);
    expect(loginBody).not.toHaveProperty('token');
    expect(loginBody.user).not.toHaveProperty('passwordHash');
    const setCookie: unknown = loginResponse.headers['set-cookie'];
    expect(Array.isArray(setCookie)).toBe(true);
    expect(String(setCookie)).toContain('HttpOnly');
    expect(String(setCookie)).toContain('SameSite=Lax');

    const storedSession = await prisma.centralSession.findUniqueOrThrow({
      where: { id: loginBody.session.id },
    });
    expect(storedSession.sessionTokenHash).toHaveLength(64);

    const sessionResponse = await agent.get('/auth/session').expect(200);
    const sessionBody = sessionResponse.body as unknown as AuthResponse;
    expect(sessionBody.session.id).toBe(loginBody.session.id);

    const accountPage = await agent.get('/').expect(200);
    expect(accountPage.text).toContain('Hello, Auth E2E User');
    expect(accountPage.text).toContain('Sign out everywhere');

    await agent.post('/auth/logout').expect(204);
    await agent.get('/auth/session').expect(401);
    const signedOutPage = await agent.get('/').expect(200);
    expect(signedOutPage.text).toContain('central session is signed out');

    const revoked = await prisma.centralSession.findUniqueOrThrow({
      where: { id: loginBody.session.id },
    });
    expect(revoked.status).toBe('REVOKED');
    expect(revoked.revokeReason).toBe('central_logout');
  });

  it('menyelesaikan authorization code, PKCE, token, dan userinfo', async () => {
    const clientSecret = process.env.APP_A_CLIENT_SECRET;
    if (!clientSecret) throw new Error('APP_A_CLIENT_SECRET tidak tersedia');
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/login').send({ email, password }).expect(200);
    const pkce = createPkcePair();
    const state = randomBytes(24).toString('base64url');
    const authorize = await agent
      .get('/oauth/authorize')
      .query({
        response_type: 'code',
        client_id: 'app-a',
        redirect_uri: 'http://localhost:4001/callback',
        state,
        code_challenge: pkce.challenge,
        code_challenge_method: 'S256',
      })
      .expect(302);
    const location = authorize.headers.location;
    if (typeof location !== 'string') {
      throw new Error('OAuth redirect location tidak tersedia');
    }
    const callback = new URL(location);
    const code = callback.searchParams.get('code');
    expect(callback.origin + callback.pathname).toBe(
      'http://localhost:4001/callback',
    );
    expect(callback.searchParams.get('state')).toBe(state);
    expect(code).toHaveLength(43);
    if (!code) throw new Error('Authorization code tidak tersedia');

    const grant = {
      grant_type: 'authorization_code',
      code,
      redirect_uri: 'http://localhost:4001/callback',
      client_id: 'app-a',
      client_secret: clientSecret,
      code_verifier: pkce.verifier,
    };
    const tokenResponse = await request(app.getHttpServer())
      .post('/oauth/token')
      .send(grant)
      .expect(200);
    const tokenBody = tokenResponse.body as unknown as {
      access_token: string;
      token_type: string;
      expires_in: number;
    };
    expect(tokenBody.access_token).toHaveLength(43);
    expect(tokenBody.token_type).toBe('Bearer');

    const userInfo = await request(app.getHttpServer())
      .get('/oauth/userinfo')
      .set('Authorization', `Bearer ${tokenBody.access_token}`)
      .expect(200);
    expect(userInfo.body).toMatchObject({
      sub: userId,
      email,
      centralSessionId: expect.any(String) as string,
    });
    expect(userInfo.body).not.toHaveProperty('passwordHash');
    await request(app.getHttpServer())
      .post('/oauth/token')
      .send(grant)
      .expect(400);
  });
});
