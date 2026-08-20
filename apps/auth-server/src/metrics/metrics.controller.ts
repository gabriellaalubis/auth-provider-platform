import { Controller, Get, Header } from '@nestjs/common';
import { MetricsService, type MetricsSnapshot } from './metrics.service';
import { renderMetricsDashboard } from './metrics.ui';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  dashboard(): string {
    return renderMetricsDashboard();
  }

  @Get('data')
  @Header('Cache-Control', 'no-store')
  data(): Promise<MetricsSnapshot> {
    return this.metrics.getSnapshot();
  }

  @Get('prometheus')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async prometheus(): Promise<string> {
    return this.metrics.toPrometheus(await this.metrics.getSnapshot());
  }
}
