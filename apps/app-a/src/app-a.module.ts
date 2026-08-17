import { Module } from '@nestjs/common';
import { PlatformConfigModule } from '@app/config';
import { AppAController } from './app-a.controller';
import { AppAService } from './app-a.service';
import { AppADatabaseModule } from '@app/app-a-database';

@Module({
  imports: [PlatformConfigModule, AppADatabaseModule],
  controllers: [AppAController],
  providers: [AppAService],
})
export class AppAModule {}