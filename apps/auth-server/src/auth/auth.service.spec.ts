import { UnauthorizedException } from '@nestjs/common';
import { AuthPrismaService } from '@app/auth-database';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';

const USER = {
  id: '45bb7591-8bc8-40f5-a658-e1ec34c5bab5',
  name: 'Test User',
  email: 'test@example.com',
  passwordHash: 'stored-hash',
  status: 'ACTIVE' as const,
  passwordChangedAt: null,
  createdAt: new Date('2026-08-16T00:00:00.000Z'),
  updatedAt: new Date('2026-08-16T00:00:00.000Z'),
};

describe('AuthService', () => {
  const authPrisma = {
    user: { findUnique: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const passwordService = {
    hash: jest.fn(),
    verify: jest.fn(),
  };
  const sessionService = { create: jest.fn() };
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    passwordService.hash.mockResolvedValue('dummy-hash');
    service = new AuthService(
      authPrisma as unknown as AuthPrismaService,
      passwordService,
      sessionService as unknown as SessionService,
    );
  });

  it('membuat session untuk credential user aktif yang benar', async () => {
    let receivedUser: unknown;
    authPrisma.user.findUnique.mockResolvedValue(USER);
    passwordService.verify.mockResolvedValue(true);
    sessionService.create.mockImplementation((user: unknown) => {
      receivedUser = user;
      return Promise.resolve({ token: 'token', auth: {} });
    });

    await service.login({ email: USER.email, password: 'password-valid' });

    expect(passwordService.verify).toHaveBeenCalledWith(
      USER.passwordHash,
      'password-valid',
    );
    expect(receivedUser).not.toHaveProperty('passwordHash');
  });

  it('memberi error generik untuk password salah', async () => {
    authPrisma.user.findUnique.mockResolvedValue(USER);
    passwordService.verify.mockResolvedValue(false);
    authPrisma.auditLog.create.mockResolvedValue({ id: 'audit-id' });

    await expect(
      service.login({ email: USER.email, password: 'password-salah' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(sessionService.create).not.toHaveBeenCalled();
  });

  it('tetap melakukan verification untuk email yang tidak dikenal', async () => {
    authPrisma.user.findUnique.mockResolvedValue(null);
    passwordService.verify.mockResolvedValue(false);
    authPrisma.auditLog.create.mockResolvedValue({ id: 'audit-id' });

    await expect(
      service.login({ email: 'unknown@example.com', password: 'password' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(passwordService.verify).toHaveBeenCalledWith(
      'dummy-hash',
      'password',
    );
  });

  it('menolak user inactive', async () => {
    authPrisma.user.findUnique.mockResolvedValue({
      ...USER,
      status: 'INACTIVE',
    });
    passwordService.verify.mockResolvedValue(true);
    authPrisma.auditLog.create.mockResolvedValue({ id: 'audit-id' });

    await expect(
      service.login({ email: USER.email, password: 'password-valid' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(sessionService.create).not.toHaveBeenCalled();
  });
});
