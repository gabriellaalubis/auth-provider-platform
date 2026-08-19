import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppAModule } from './../src/app-a.module';
import cookieParser from 'cookie-parser';

describe('AppAController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppAModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  it('renders the App A signed-out SSO page', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Content-Type', /html/)
      .expect((response) => {
        expect(response.text).toContain('APP A');
        expect(response.text).toContain('Sign in with SSO');
      });
  });

  it('rejects a missing local session', () =>
    request(app.getHttpServer()).get('/api/session').expect(401));

  afterEach(async () => {
    await app.close();
  });
});
