import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppBModule } from './../src/app-b.module';
import cookieParser from 'cookie-parser';

describe('AppBController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppBModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  it('renders the App B signed-out SSO page', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Content-Type', /html/)
      .expect((response) => {
        expect(response.text).toContain('APP B');
        expect(response.text).toContain('Sign in with SSO');
      });
  });

  it('rejects a missing local session', () =>
    request(app.getHttpServer()).get('/api/session').expect(401));

  it('shows the normal page with an error message for an invalid callback', async () => {
    const callback = await request(app.getHttpServer())
      .get('/callback')
      .expect(302);

    expect(callback.headers.location).toMatch(
      /^\/?\?error=login_failed&requestId=/,
    );
    await request(app.getHttpServer())
      .get(callback.headers.location)
      .expect(200)
      .expect('Content-Type', /html/)
      .expect((response) => {
        expect(response.text).toContain('Sign-in failed. Please try again.');
        expect(response.text).toContain('Sign in with SSO');
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
