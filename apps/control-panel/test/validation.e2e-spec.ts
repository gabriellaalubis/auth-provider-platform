import {
  Body,
  Controller,
  Get,
  INestApplication,
  Module,
  Post,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
  RequestIdMiddleware,
  RequestWithId,
  StandardExceptionFilter,
} from '@app/shared';
import { CreateUserDto } from '../src/users/dto/create-user.dto';
import type { ErrorResponse } from '@app/contracts';

@Controller('validation-test')
class ValidationTestController {
  @Post()
  create(@Body() body: CreateUserDto): CreateUserDto {
    return body;
  }

  @Get('internal-error')
  internalError(): never {
    throw new Error('SECRET_STACK_MARKER');
  }
}

@Module({
  controllers: [ValidationTestController],
})
class ValidationTestModule {}

describe('Validation and standard error response (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ValidationTestModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    const requestIdMiddleware = new RequestIdMiddleware();

    app.use(
      (httpRequest: Request, response: Response, next: NextFunction): void => {
        requestIdMiddleware.use(httpRequest as RequestWithId, response, next);
      },
    );

    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );

    app.useGlobalFilters(new StandardExceptionFilter());

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('menolak body kosong dengan status 400', async () => {
    const response = await request(app.getHttpServer())
      .post('/validation-test')
      .send({})
      .expect(400);

    const body = response.body as unknown as ErrorResponse;

    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('Some submitted data is invalid.');
    expect(typeof body.error.requestId).toBe('string');
    expect(body.error.requestId).not.toBe('');
    expect(body.error.requestId).toBe(response.headers['x-request-id']);
  });

  it('menolak email yang tidak valid', async () => {
    await request(app.getHttpServer())
      .post('/validation-test')
      .send({
        name: 'Test User',
        email: 'bukan-email',
        password: 'password-test-yang-panjang',
      })
      .expect(400);
  });

  it('menolak nama kosong', async () => {
    await request(app.getHttpServer())
      .post('/validation-test')
      .send({
        name: '   ',
        email: 'test@example.com',
        password: 'password-test-yang-panjang',
      })
      .expect(400);
  });

  it('menolak field tambahan', async () => {
    await request(app.getHttpServer())
      .post('/validation-test')
      .send({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password-test-yang-panjang',
        isAdmin: true,
      })
      .expect(400);
  });

  it('menerima dan menormalisasi body yang valid', async () => {
    const password = 'password dengan spasi';

    const response = await request(app.getHttpServer())
      .post('/validation-test')
      .send({
        name: '  Test User  ',
        email: '  Test@Example.COM  ',
        password,
      })
      .expect(201);

    expect(response.body).toEqual({
      name: 'Test User',
      email: 'test@example.com',
      password,
    });
  });

  it('menghasilkan format error standar', async () => {
    const response = await request(app.getHttpServer())
      .post('/validation-test')
      .send({})
      .expect(400);

    const body = response.body as unknown as ErrorResponse;

    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('Some submitted data is invalid.');
    expect(typeof body.error.requestId).toBe('string');
    expect(body.error.requestId).not.toBe('');
    expect(response.headers['x-request-id']).toBe(body.error.requestId);
  });

  it('tidak membocorkan stack trace pada error 500', async () => {
    const response = await request(app.getHttpServer())
      .get('/validation-test/internal-error')
      .expect(500);

    const body = response.body as unknown as ErrorResponse;

    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe(
      'Something went wrong. Please try again later.',
    );
    expect(typeof body.error.requestId).toBe('string');
    expect(body.error.requestId).not.toBe('');
    expect(response.headers['x-request-id']).toBe(body.error.requestId);

    const responseText = JSON.stringify(body);

    expect(responseText).not.toContain('SECRET_STACK_MARKER');
    expect(responseText).not.toContain('.ts:');
    expect(body).not.toHaveProperty('stack');
    expect(body.error).not.toHaveProperty('stack');
  });
});
