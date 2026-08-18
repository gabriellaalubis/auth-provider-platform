import { Module } from '@nestjs/common';
import { PlatformConfigModule } from '@app/config';
import { AppBController } from './app-b.controller';
import { AppBService } from './app-b.service';
import { AppBDatabaseModule } from '@app/app-b-database';

@Module({
  imports: [PlatformConfigModule, AppBDatabaseModule],
  controllers: [AppBController],
  providers: [AppBService],
})
export class AppBModule {}
