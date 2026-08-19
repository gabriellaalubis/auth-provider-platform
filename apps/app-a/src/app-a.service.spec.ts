import {
  LocalSessionStatus,
  type AppAPrismaService,
} from '@app/app-a-database';
import { AppAService } from './app-a.service';
import type { LocalSessionView } from './auth/app-auth.service';

const NOW = new Date('2026-08-19T08:00:00.000Z');

describe('AppAService', () => {
  const prisma = {
    activityLog: { findMany: jest.fn() },
    processedEvent: { findMany: jest.fn() },
  };
  let service: AppAService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.activityLog.findMany.mockResolvedValue([]);
    prisma.processedEvent.findMany.mockResolvedValue([]);
    service = new AppAService(prisma as unknown as AppAPrismaService);
  });

  it('renders a clear SSO action for a signed-out visitor', async () => {
    const html = await service.renderHome(null);
    expect(html).toContain('APP A');
    expect(html).toContain('Sign in with SSO');
    expect(html).toContain('Your password is never shared with App A.');
    expect(html).not.toContain('Sign out of App A');
  });

  it('renders a safe sign-in error with a request ID', async () => {
    const html = await service.renderHome(null, '<unsafe-request-id>');
    expect(html).toContain('Sign-in failed. Please try again.');
    expect(html).toContain('&lt;unsafe-request-id&gt;');
    expect(html).not.toContain('<unsafe-request-id>');
  });

  it('renders identity, session, activity, and processed events', async () => {
    const auth: LocalSessionView = {
      session: {
        id: 'session-id',
        status: LocalSessionStatus.ACTIVE,
        createdAt: NOW,
        expiresAt: new Date(NOW.getTime() + 60_000),
        lastActivityAt: NOW,
      },
      user: {
        id: 'user-id',
        name: 'Alya Rahman',
        email: 'alya@example.com',
        groups: ['app-a-users'],
        syncedAt: NOW,
      },
    };
    prisma.activityLog.findMany.mockResolvedValueOnce([
      {
        eventType: 'LOCAL_SESSION_CREATED',
        message: 'Local session created',
        correlationId: '10000000-0000-4000-8000-000000000001',
        createdAt: NOW,
      },
    ]);
    prisma.processedEvent.findMany.mockResolvedValueOnce([
      {
        eventId: '20000000-0000-4000-8000-000000000001',
        eventType: 'SessionRevoked',
        processedAt: NOW,
        result: 'Local session revoked',
      },
    ]);
    const html = await service.renderHome(auth);
    expect(html).toContain('Hello, Alya Rahman');
    expect(html).toContain('alya@example.com');
    expect(html).toContain('app-a-users');
    expect(html).toContain('Local session');
    expect(html).toContain('Activity log');
    expect(html).toContain('Local session created');
    expect(html).toContain('Processed events');
    expect(html).toContain('SessionRevoked');
    expect(html).toContain('Sign out of App A');
  });

  it('escapes profile and database text before inserting it into HTML', async () => {
    const auth: LocalSessionView = {
      session: {
        id: 'session-id',
        status: LocalSessionStatus.ACTIVE,
        createdAt: NOW,
        expiresAt: new Date(NOW.getTime() + 60_000),
        lastActivityAt: null,
      },
      user: {
        id: 'user-id',
        name: '<script>alert(1)</script>',
        email: 'unsafe&email@example.com',
        groups: ['<admin>'],
        syncedAt: NOW,
      },
    };
    prisma.activityLog.findMany.mockResolvedValueOnce([
      {
        eventType: 'TEST',
        message: '<img src=x onerror=alert(1)>',
        correlationId: null,
        createdAt: NOW,
      },
    ]);
    const html = await service.renderHome(auth);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('unsafe&amp;email@example.com');
    expect(html).toContain('&lt;admin&gt;');
  });
});
