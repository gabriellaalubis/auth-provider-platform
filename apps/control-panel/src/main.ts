import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ControlPanelModule } from './control-panel.module';

async function bootstrap() {
  const app = await NestFactory.create(ControlPanelModule);
  const configService = app.get(ConfigService);
  const port = configService.getOrThrow<number>('CONTROL_PANEL_PORT');

  await app.listen(port, '0.0.0.0');
}

bootstrap().catch((error: unknown) => {
  console.error('Control Panel failed to start', error);
  process.exit(1);
});
