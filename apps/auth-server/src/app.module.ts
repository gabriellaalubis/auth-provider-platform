import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { PlatformConfigModule } from '@app/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthDatabaseModule } from '@app/auth-database';
import { RequestIdMiddleware } from '@app/shared';
import { SecurityModule } from '@app/security';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    PlatformConfigModule,
    AuthDatabaseModule,
    SecurityModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
