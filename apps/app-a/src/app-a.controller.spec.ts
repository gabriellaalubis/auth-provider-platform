import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AppAController } from './app-a.controller';
import { AppAService } from './app-a.service';
import { AppAuthService } from './auth/app-auth.service';

describe('AppAController', () => {
  const appAService = { renderHome: jest.fn() };
  const appAuthService = { readLocalSession: jest.fn() };
  const config = { getOrThrow: jest.fn().mockReturnValue('app_a_session') };
  let controller: AppAController;

  beforeEach(() => {
    jest.clearAllMocks();
    appAService.renderHome.mockResolvedValue('<html>App A</html>');
    controller = new AppAController(
      appAService as unknown as AppAService,
      appAuthService as unknown as AppAuthService,
      config as unknown as ConfigService,
    );
  });

  it('renders the signed-out page when the local cookie is missing', async () => {
    const request = { cookies: {} } as Request;
    await expect(controller.home(request, undefined, undefined)).resolves.toBe(
      '<html>App A</html>',
    );
    expect(appAuthService.readLocalSession).not.toHaveBeenCalled();
    expect(appAService.renderHome).toHaveBeenCalledWith(null, undefined);
  });

  it('loads the local session when its cookie exists', async () => {
    const auth = { session: { id: 'session-id' }, user: { id: 'user-id' } };
    appAuthService.readLocalSession.mockResolvedValueOnce(auth);
    const request = {
      cookies: { app_a_session: 'raw-local-token' },
    } as unknown as Request;
    await controller.home(request, undefined, undefined);
    expect(appAuthService.readLocalSession).toHaveBeenCalledWith(
      'raw-local-token',
    );
    expect(appAService.renderHome).toHaveBeenCalledWith(auth, undefined);
  });

  it('keeps the health response available', () => {
    expect(controller.getHealth()).toEqual({ status: 'ok', service: 'app-a' });
  });
});
