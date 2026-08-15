import { Module } from '@nestjs/common';
import { PlatformConfigModule } from '@app/config';
import { AppAController } from './app-a.controller';
import { AppAService } from './app-a.service';

@Module({
  imports: [PlatformConfigModule],
  controllers: [AppAController],
  providers: [AppAService],
})
export class AppAModule {}
