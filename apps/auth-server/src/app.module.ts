import { Module } from '@nestjs/common';
import { PlatformConfigModule } from '@app/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [PlatformConfigModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
