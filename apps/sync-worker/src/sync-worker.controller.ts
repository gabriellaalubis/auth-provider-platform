import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@app/contracts';
import { SyncWorkerService } from './sync-worker.service';

@Controller()
export class SyncWorkerController {
  constructor(private readonly syncWorkerService: SyncWorkerService) {}

  @Get()
  getHello(): string {
    return this.syncWorkerService.getHello();
  }

  @Get('health')
  getHealth(): HealthResponse {
    return { status: 'ok', service: 'sync-worker' };
  }
}
