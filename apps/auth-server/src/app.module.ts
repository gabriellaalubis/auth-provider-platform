import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { PlatformConfigModule } from '@app/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthDatabaseModule } from '@app/auth-database';
import { RequestIdMiddleware } from '@app/shared';
import { SecurityModule } from '@app/security';
import { AuthModule } from './auth/auth.module';
import { OAuthModule } from './oauth/oauth.module';
import { EventsModule } from './events/events.module';
import { HealthService } from './health/health.service';
import { MetricsController } from './metrics/metrics.controller';
import { MetricsMiddleware } from './metrics/metrics.middleware';
import { MetricsService } from './metrics/metrics.service';

@Module({
  imports: [
    PlatformConfigModule,
    AuthDatabaseModule,
    SecurityModule,
    AuthModule,
    OAuthModule,
    EventsModule,
  ],
  controllers: [AppController, MetricsController],
  providers: [AppService, HealthService, MetricsService, MetricsMiddleware],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, MetricsMiddleware).forRoutes('*');
  }
}
