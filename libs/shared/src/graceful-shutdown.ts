import { Logger } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';

type ShutdownSignal = 'SIGINT' | 'SIGTERM';

export class GracefulShutdownManager {
  private shutdownPromise?: Promise<void>;

  constructor(
    private readonly app: INestApplication,
    private readonly timeoutMilliseconds: number,
    private readonly logger = new Logger('GracefulShutdown'),
  ) {}

  register(): void {
    process.once('SIGTERM', () => void this.shutdown('SIGTERM'));
    process.once('SIGINT', () => void this.shutdown('SIGINT'));
  }

  shutdown(signal: ShutdownSignal): Promise<void> {
    this.shutdownPromise ??= this.performShutdown(signal);
    return this.shutdownPromise;
  }

  private async performShutdown(signal: ShutdownSignal): Promise<void> {
    this.logger.log(`${signal} received; graceful shutdown started`);
    const server = this.app.getHttpServer() as Server;
    const drained = await this.stopAcceptingRequests(server);

    if (!drained) {
      this.logger.warn('HTTP drain timed out; closing remaining connections');
      server.closeAllConnections?.();
    }

    await this.app.close();
    this.logger.log('Graceful shutdown completed');
  }

  private stopAcceptingRequests(server: Server): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (drained: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(drained);
      };
      const timeout = setTimeout(() => finish(false), this.timeoutMilliseconds);

      server.close(() => finish(true));
      server.closeIdleConnections?.();
    });
  }
}

export function registerGracefulShutdown(
  app: INestApplication,
  timeoutMilliseconds: number,
): GracefulShutdownManager {
  const manager = new GracefulShutdownManager(app, timeoutMilliseconds);
  manager.register();
  return manager;
}
