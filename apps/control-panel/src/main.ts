import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ControlPanelModule } from './control-panel.module';
import { registerGracefulShutdown, StandardExceptionFilter } from '@app/shared';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(ControlPanelModule);
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new StandardExceptionFilter());
  const configService = app.get(ConfigService);
  const port = configService.getOrThrow<number>('CONTROL_PANEL_PORT');

  await app.listen(port, '0.0.0.0');
  registerGracefulShutdown(
    app,
    configService.getOrThrow<number>('SHUTDOWN_TIMEOUT_MS'),
  );
}

bootstrap().catch((error: unknown) => {
  console.error('Control Panel failed to start', error);
  process.exit(1);
});
