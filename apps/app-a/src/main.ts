import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppAModule } from './app-a.module';

async function bootstrap() {
  const app = await NestFactory.create(AppAModule);
  const configService = app.get(ConfigService);
  const port = configService.getOrThrow<number>('APP_A_PORT');

  await app.listen(port, '0.0.0.0');
}

bootstrap().catch((error: unknown) => {
  console.error('App A failed to start', error);
  process.exit(1);
});
