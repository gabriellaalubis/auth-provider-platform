import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppAModule } from './app-a.module';
import cookieParser from 'cookie-parser';
import { join } from 'node:path';
import { StandardExceptionFilter } from '@app/shared';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppAModule);
  app.use(cookieParser());
  app.useGlobalFilters(new StandardExceptionFilter());
  app.useStaticAssets(join(process.cwd(), 'apps', 'app-a', 'public'));
  const configService = app.get(ConfigService);
  const port = configService.getOrThrow<number>('APP_A_PORT');

  await app.listen(port, '0.0.0.0');
}

bootstrap().catch((error: unknown) => {
  console.error('App A failed to start', error);
  process.exit(1);
});
