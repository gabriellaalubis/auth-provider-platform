import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AuthDatabaseModule } from '@app/auth-database';
import { PlatformConfigModule } from '@app/config';
import { RequestIdMiddleware } from '@app/shared';
import { ControlPanelController } from './control-panel.controller';
import { SecurityModule } from '@app/security';
import { UsersModule } from './users/users.module';
import { GroupsModule } from './groups/groups.module';
import { ApplicationsModule } from './applications/applications.module';
import { APP_GUARD } from '@nestjs/core';
import { AdminAccessGuard } from './auth/admin-access.guard';

@Module({
  imports: [
    PlatformConfigModule,
    AuthDatabaseModule,
    SecurityModule,
    UsersModule,
    GroupsModule,
    ApplicationsModule,
  ],
  controllers: [ControlPanelController],
  providers: [{ provide: APP_GUARD, useClass: AdminAccessGuard }],
})
export class ControlPanelModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
