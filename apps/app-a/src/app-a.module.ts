import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { PlatformConfigModule } from '@app/config';
import { AppAController } from './app-a.controller';
import { AppAService } from './app-a.service';
import { AppADatabaseModule } from '@app/app-a-database';
import { AppAuthModule } from './auth/app-auth.module';
import { RequestIdMiddleware } from '@app/shared';

@Module({
  imports: [PlatformConfigModule, AppADatabaseModule, AppAuthModule],
  controllers: [AppAController],
  providers: [AppAService],
})
export class AppAModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
