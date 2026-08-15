import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { PlatformConfigModule } from '@app/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthDatabaseModule } from '@app/auth-database';
import { RequestIdMiddleware } from '@app/shared';
import { SecurityModule } from 'libs/security/src';

@Module({
  imports: [PlatformConfigModule, AuthDatabaseModule, SecurityModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
