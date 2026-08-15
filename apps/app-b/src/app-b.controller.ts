import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@app/contracts';
import { AppBService } from './app-b.service';

@Controller()
export class AppBController {
  constructor(private readonly appBService: AppBService) {}

  @Get()
  getHello(): string {
    return this.appBService.getHello();
  }

  @Get('health')
  getHealth(): HealthResponse {
    return { status: 'ok', service: 'app-b' };
  }
}
