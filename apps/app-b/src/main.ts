import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppBModule } from './app-b.module';

async function bootstrap() {
  const app = await NestFactory.create(AppBModule);
  const configService = app.get(ConfigService);
  const port = configService.getOrThrow<number>('APP_B_PORT');

  await app.listen(port, '0.0.0.0');
}

bootstrap().catch((error: unknown) => {
  console.error('App B failed to start', error);
  process.exit(1);
});
