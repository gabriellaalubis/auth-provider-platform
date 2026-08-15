import { Module } from '@nestjs/common';
import { PlatformConfigModule } from '@app/config';
import { AppBController } from './app-b.controller';
import { AppBService } from './app-b.service';

@Module({
  imports: [PlatformConfigModule],
  controllers: [AppBController],
  providers: [AppBService],
})
export class AppBModule {}
