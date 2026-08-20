import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { PlatformConfigModule } from '@app/config';
import { AppBController } from './app-b.controller';
import { AppBService } from './app-b.service';
import { AppBDatabaseModule } from '@app/app-b-database';
import { AppAuthModule } from './auth/app-auth.module';
import { RequestIdMiddleware } from '@app/shared';

@Module({
  imports: [PlatformConfigModule, AppBDatabaseModule, AppAuthModule],
  controllers: [AppBController],
  providers: [AppBService],
})
export class AppBModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
