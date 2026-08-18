import { Module } from '@nestjs/common';
import { AppADatabaseModule } from '@app/app-a-database';
import { PlatformConfigModule } from '@app/config';
import { AppAuthController } from './app-auth.controller';
import { AppAuthService } from './app-auth.service';

@Module({
  imports: [PlatformConfigModule, AppADatabaseModule],
  controllers: [AppAuthController],
  providers: [AppAuthService],
  exports: [AppAuthService],
})
export class AppAuthModule {}
