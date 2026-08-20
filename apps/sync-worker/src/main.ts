import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { SyncWorkerModule } from './sync-worker.module';
import { registerGracefulShutdown } from '@app/shared';

async function bootstrap() {
  const app = await NestFactory.create(SyncWorkerModule);
  const configService = app.get(ConfigService);
  const port = configService.getOrThrow<number>('SYNC_WORKER_PORT');

  await app.listen(port, '0.0.0.0');
  registerGracefulShutdown(
    app,
    configService.getOrThrow<number>('SHUTDOWN_TIMEOUT_MS'),
  );
}

bootstrap().catch((error: unknown) => {
  console.error('Sync Worker failed to start', error);
  process.exit(1);
});
