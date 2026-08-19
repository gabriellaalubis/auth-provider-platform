import { Module } from '@nestjs/common';
import { AppBDatabaseModule } from '@app/app-b-database';
import { PlatformConfigModule } from '@app/config';
import { AppAuthController } from './app-auth.controller';
import { AppAuthService } from './app-auth.service';

@Module({
  imports: [PlatformConfigModule, AppBDatabaseModule],
  controllers: [AppAuthController],
  providers: [AppAuthService],
  exports: [AppAuthService],
})
export class AppAuthModule {}
