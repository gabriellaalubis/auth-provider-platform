import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthPrismaService } from '@app/auth-database';
import type { AuthResponse, ErrorResponse } from '@app/contracts';
import { PasswordService } from '@app/security';
import { StandardExceptionFilter } from '@app/shared';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Auth central session (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: AuthPrismaService;
  const email = `e2e-auth-${randomUUID()}@example.com`;
  const password = 'e2e-auth-password-yang-aman';
  let userId = '';

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
  });

  afterAll(async () => {
    if (userId) {
      await prisma.authorizationCode.deleteMany({ where: { userId } });
      await prisma.accessToken.deleteMany({ where: { userId } });
      await prisma.centralSession.deleteMany({ where: { userId } });
      await prisma.auditLog.deleteMany({ where: { userId } });
      await prisma.event.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await app.close();
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

    await agent.post('/auth/logout').expect(204);
    await agent.get('/auth/session').expect(401);

    const revoked = await prisma.centralSession.findUniqueOrThrow({
      where: { id: loginBody.session.id },
    });
    expect(revoked.status).toBe('REVOKED');
    expect(revoked.revokeReason).toBe('central_logout');
  });
});
