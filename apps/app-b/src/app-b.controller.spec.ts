import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AppBController } from './app-b.controller';
import { AppBService } from './app-b.service';
import { AppAuthService } from './auth/app-auth.service';

describe('AppBController', () => {
  const service = { renderHome: jest.fn() };
  const auth = { readLocalSession: jest.fn() };
  const config = { getOrThrow: jest.fn().mockReturnValue('app_b_session') };
  let controller: AppBController;

  beforeEach(() => {
    jest.clearAllMocks();
    service.renderHome.mockResolvedValue('<html>App B</html>');
    controller = new AppBController(
      service as unknown as AppBService,
      auth as unknown as AppAuthService,
      config as unknown as ConfigService,
    );
  });

  it('renders the signed-out page without a local cookie', async () => {
    await expect(
      controller.home({ cookies: {} } as Request),
    ).resolves.toContain('App B');
    expect(auth.readLocalSession).not.toHaveBeenCalled();
    expect(service.renderHome).toHaveBeenCalledWith(null, undefined);
  });

  it('loads an independent App B local session', async () => {
    const session = { session: { id: 'b-session' }, user: { id: 'user' } };
    auth.readLocalSession.mockResolvedValueOnce(session);
    await controller.home({
      cookies: { app_b_session: 'b-token' },
    } as unknown as Request);
    expect(auth.readLocalSession).toHaveBeenCalledWith('b-token');
    expect(service.renderHome).toHaveBeenCalledWith(session, undefined);
  });

  it('keeps the health response available', () => {
    expect(controller.getHealth()).toEqual({ status: 'ok', service: 'app-b' });
  });
});
