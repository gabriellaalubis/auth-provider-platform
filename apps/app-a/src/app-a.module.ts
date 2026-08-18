import { Module } from '@nestjs/common';
import { PlatformConfigModule } from '@app/config';
import { AppAController } from './app-a.controller';
import { AppAService } from './app-a.service';
import { AppADatabaseModule } from '@app/app-a-database';
import { AppAuthModule } from './auth/app-auth.module';

@Module({
  imports: [PlatformConfigModule, AppADatabaseModule, AppAuthModule],
  controllers: [AppAController],
  providers: [AppAService],
})
export class AppAModule {}
