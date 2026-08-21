import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthPrismaService } from '@app/auth-database';
import type { ErrorResponse, UserResponse } from '@app/contracts';
import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import { ControlPanelModule } from './../src/control-panel.module';
import { TokenService } from '@app/security';

describe('Control Panel users (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: AuthPrismaService;
  let adminCookie = '';
  let adminUserId = '';
  let tokenService: TokenService;
  const email = `e2e-control-${randomUUID()}@example.com`;
  const password = 'e2e-control-password-aman';
  let userId = '';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ControlPanelModule],
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
    await app.init();
    prisma = app.get(AuthPrismaService);
    tokenService = app.get(TokenService);
    const adminGroup = await prisma.group.upsert({
      where: { name: 'admin' },
      create: { name: 'admin', description: 'Control Panel administrators' },
      update: {},
    });
    const admin = await prisma.user.create({
      data: {
        name: 'E2E Control Administrator',
        email: `e2e-admin-${randomUUID()}@example.com`,
        passwordHash: 'not-used-by-this-test',
        groups: { create: { groupId: adminGroup.id } },
      },
    });
    adminUserId = admin.id;
    const rawToken = randomUUID();
    await prisma.centralSession.create({
      data: {
        sessionTokenHash: tokenService.hash(rawToken),
        userId: admin.id,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    adminCookie = `central_session=${rawToken}`;
  });

  afterAll(async () => {
    if (userId) {
      await prisma.centralSession.deleteMany({ where: { userId } });
      await prisma.auditLog.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    if (adminUserId) {
      await prisma.centralSession.deleteMany({
        where: { userId: adminUserId },
      });
      await prisma.auditLog.deleteMany({ where: { userId: adminUserId } });
      await prisma.user.deleteMany({ where: { id: adminUserId } });
    }
    await app.close();
  });

  it('serves the interactive administrative interface', async () => {
    const signedOut = await request(app.getHttpServer())
      .get('/')
      .expect('Content-Type', /html/)
      .expect(401);
    expect(signedOut.text).toContain('Administrator sign-in required');
    expect(signedOut.text).toContain('Sign in');

    const expiredToken = randomUUID();
    await prisma.centralSession.create({
      data: {
        sessionTokenHash: tokenService.hash(expiredToken),
        userId: adminUserId,
        expiresAt: new Date(Date.now() - 1_000),
      },
    });
    const expired = await request(app.getHttpServer())
      .get('/')
      .set('Cookie', `central_session=${expiredToken}`)
      .expect('Content-Type', /html/)
      .expect(401);
    expect(expired.text).toContain('Administrator sign-in required');
    expect(expired.text).not.toContain('Session expired');

    await request(app.getHttpServer()).get('/health').expect(200);

    const response = await request(app.getHttpServer())
      .get('/')
      .set('Cookie', adminCookie)
      .expect('Content-Type', /html/)
      .expect(200);

    expect(response.text).toContain('<title>SSO Control Panel</title>');
    expect(response.text).toContain('Identity and access administration');
    expect(response.text).toContain('Manage members');
    expect(response.text).toContain('Manage access');
    expect(response.text).not.toContain('Hello World!');
  });

  it('menyelesaikan alur pengelolaan user tanpa membocorkan credential', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/users')
      .set('Cookie', adminCookie)
      .send({ name: '  E2E User  ', email: email.toUpperCase(), password })
      .expect(201);
    const created = createResponse.body as unknown as UserResponse;
    userId = created.id;

    expect(created.name).toBe('E2E User');
    expect(created.email).toBe(email);
    expect(created).not.toHaveProperty('password');
    expect(created).not.toHaveProperty('passwordHash');

    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    expect(stored.passwordHash).not.toBe(password);
    expect(stored.passwordHash).toContain('$argon2id$');

    const nonAdminToken = randomUUID();
    await prisma.centralSession.create({
      data: {
        sessionTokenHash: tokenService.hash(nonAdminToken),
        userId,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await request(app.getHttpServer())
      .get('/users')
      .set('Cookie', `central_session=${nonAdminToken}`)
      .expect(403);

    const deniedPage = await request(app.getHttpServer())
      .get('/')
      .set('Cookie', `central_session=${nonAdminToken}`)
      .expect('Content-Type', /html/)
      .expect(403);
    expect(deniedPage.text).toContain('Access denied');
    expect(deniedPage.text).toContain('Sign out and use another account');

    const duplicateResponse = await request(app.getHttpServer())
      .post('/users')
      .set('Cookie', adminCookie)
      .send({ name: 'Duplicate', email, password })
      .expect(409);
    const duplicateBody = duplicateResponse.body as unknown as ErrorResponse;
    expect(duplicateBody.error.code).toBe('CONFLICT');

    const listResponse = await request(app.getHttpServer())
      .get('/users')
      .set('Cookie', adminCookie)
      .expect(200);
    const users = listResponse.body as unknown as UserResponse[];
    const listedUser = users.find((user) => user.id === userId);
    expect(listedUser).toBeDefined();
    expect(listedUser).not.toHaveProperty('passwordHash');

    const updatedResponse = await request(app.getHttpServer())
      .patch(`/users/${userId}`)
      .set('Cookie', adminCookie)
      .send({ name: 'Updated E2E User' })
      .expect(200);
    const updated = updatedResponse.body as unknown as UserResponse;
    expect(updated.name).toBe('Updated E2E User');

    await request(app.getHttpServer())
      .patch(`/users/${userId}/password`)
      .set('Cookie', adminCookie)
      .send({ password: 'e2e-password-baru-yang-aman' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/users/${userId}/status`)
      .set('Cookie', adminCookie)
      .send({ status: 'INACTIVE' })
      .expect(200);

    const auditCount = await prisma.auditLog.count({ where: { userId } });
    expect(auditCount).toBeGreaterThanOrEqual(4);
  });
});
