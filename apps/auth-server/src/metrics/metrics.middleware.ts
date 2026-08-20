import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(request: Request, response: Response, next: NextFunction): void {
    if (
      request.path.startsWith('/metrics') ||
      request.path.startsWith('/health')
    ) {
      next();
      return;
    }
    const startedAt = process.hrtime.bigint();
    response.once('finish', () => {
      const elapsed = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      this.metrics.recordRequest(elapsed, response.statusCode);
    });
    next();
  }
}
