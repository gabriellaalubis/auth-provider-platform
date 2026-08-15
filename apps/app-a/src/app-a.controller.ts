import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@app/contracts';
import { AppAService } from './app-a.service';

@Controller()
export class AppAController {
  constructor(private readonly appAService: AppAService) {}

  @Get()
  getHello(): string {
    return this.appAService.getHello();
  }

  @Get('health')
  getHealth(): HealthResponse {
    return { status: 'ok', service: 'app-a' };
  }
}
