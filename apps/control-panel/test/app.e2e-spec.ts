import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthPrismaService } from '@app/auth-database';
import type { ErrorResponse, UserResponse } from '@app/contracts';
import { StandardExceptionFilter } from '@app/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { ControlPanelModule } from './../src/control-panel.module';

describe('Control Panel users (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: AuthPrismaService;
  const email = `e2e-control-${randomUUID()}@example.com`;
  const password = 'e2e-control-password-aman';
  let userId = '';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ControlPanelModule],
    }).compile();

    app = moduleFixture.createNestApplication();
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
  });

  afterAll(async () => {
    if (userId) {
      await prisma.centralSession.deleteMany({ where: { userId } });
      await prisma.auditLog.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await app.close();
  });

  it('serves the interactive administrative interface', async () => {
    const response = await request(app.getHttpServer())
      .get('/')
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

    const duplicateResponse = await request(app.getHttpServer())
      .post('/users')
      .send({ name: 'Duplicate', email, password })
      .expect(409);
    const duplicateBody = duplicateResponse.body as unknown as ErrorResponse;
    expect(duplicateBody.error.code).toBe('CONFLICT');

    const listResponse = await request(app.getHttpServer())
      .get('/users')
      .expect(200);
    const users = listResponse.body as unknown as UserResponse[];
    const listedUser = users.find((user) => user.id === userId);
    expect(listedUser).toBeDefined();
    expect(listedUser).not.toHaveProperty('passwordHash');

    const updatedResponse = await request(app.getHttpServer())
      .patch(`/users/${userId}`)
      .send({ name: 'Updated E2E User' })
      .expect(200);
    const updated = updatedResponse.body as unknown as UserResponse;
    expect(updated.name).toBe('Updated E2E User');

    await request(app.getHttpServer())
      .patch(`/users/${userId}/password`)
      .send({ password: 'e2e-password-baru-yang-aman' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/users/${userId}/status`)
      .send({ status: 'INACTIVE' })
      .expect(200);

    const auditCount = await prisma.auditLog.count({ where: { userId } });
    expect(auditCount).toBeGreaterThanOrEqual(4);
  });
});
