import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AuthDatabaseModule } from '@app/auth-database';
import { PlatformConfigModule } from '@app/config';
import { RequestIdMiddleware } from '@app/shared';
import { ControlPanelController } from './control-panel.controller';
import { ControlPanelService } from './control-panel.service';
import { SecurityModule } from 'libs/security/src';

@Module({
  imports: [PlatformConfigModule, AuthDatabaseModule, SecurityModule],
  controllers: [ControlPanelController],
  providers: [ControlPanelService],
})
export class ControlPanelModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
