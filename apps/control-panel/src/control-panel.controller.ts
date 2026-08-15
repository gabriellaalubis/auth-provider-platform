import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@app/contracts';
import { ControlPanelService } from './control-panel.service';

@Controller()
export class ControlPanelController {
  constructor(private readonly controlPanelService: ControlPanelService) {}

  @Get()
  getHello(): string {
    return this.controlPanelService.getHello();
  }

  @Get('health')
  getHealth(): HealthResponse {
    return { status: 'ok', service: 'control-panel' };
  }
}
