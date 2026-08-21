import { Controller, Get, Header } from '@nestjs/common';
import type { HealthResponse } from '@app/contracts';
import { renderAdminUi } from './admin-ui';
import { PublicRoute } from './auth/public-route.decorator';

@Controller()
export class ControlPanelController {
  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  getControlPanel(): string {
    return renderAdminUi();
  }

  @Get('health')
  @PublicRoute()
  getHealth(): HealthResponse {
    return { status: 'ok', service: 'control-panel' };
  }
}
