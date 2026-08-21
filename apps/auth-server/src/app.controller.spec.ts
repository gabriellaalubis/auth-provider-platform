import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SessionService } from './auth/session.service';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { HealthService } from './health/health.service';
import { MfaService } from './auth/mfa.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: SessionService, useValue: { getValidSession: jest.fn() } },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue('central_session'),
          },
        },
        {
          provide: HealthService,
          useValue: {
            getLiveness: jest.fn().mockReturnValue({
              status: 'live',
              service: 'auth-server',
            }),
            getReadiness: jest.fn().mockResolvedValue({
              status: 'ready',
              service: 'auth-server',
              components: {
                database: { status: 'up' },
                messageBroker: { status: 'up' },
              },
            }),
          },
        },
        {
          provide: MfaService,
          useValue: {
            getStatus: jest.fn().mockResolvedValue({
              enabled: false,
              recoveryCodesRemaining: 0,
            }),
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('renders the signed-out SSO portal', async () => {
      const result = await appController.home({ cookies: {} } as Request);
      expect(result).toContain('Central Sign-On');
      expect(result).toContain('Sign in');
      expect(result).toContain('View system metrics');
    });

    it('renders identity and the global logout button for an active session', () => {
      const service = new AppService();
      const result = service.renderHome(
        {
          user: {
            id: '11111111-1111-4111-8111-111111111111',
            name: 'Test User',
            email: 'test@example.com',
            status: 'ACTIVE',
            passwordChangedAt: null,
            createdAt: new Date('2026-08-19T00:00:00.000Z'),
            updatedAt: new Date('2026-08-19T00:00:00.000Z'),
          },
          session: {
            id: '22222222-2222-4222-8222-222222222222',
            status: 'ACTIVE',
            createdAt: new Date('2026-08-19T00:00:00.000Z'),
            expiresAt: new Date('2026-08-20T00:00:00.000Z'),
          },
        },
        { enabled: false, recoveryCodesRemaining: 0 },
      );
      expect(result).toContain('Hello, Test User');
      expect(result).toContain('Sign out everywhere');
      expect(result).toContain('View system metrics');
      expect(result).toContain('Set up MFA');
      expect(result).toContain("fetch('/auth/logout'");
    });
  });

  describe('health probes', () => {
    it('returns the liveness result', () => {
      expect(appController.getLiveness()).toEqual({
        status: 'live',
        service: 'auth-server',
      });
    });

    it('returns HTTP 200 when every readiness dependency is available', async () => {
      const status = jest.fn();
      const result = await appController.getReadiness({ status } as never);

      expect(status).toHaveBeenCalledWith(200);
      expect(result.status).toBe('ready');
    });
  });
});
