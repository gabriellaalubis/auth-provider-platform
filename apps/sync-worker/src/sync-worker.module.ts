import { Module } from '@nestjs/common';
import { PlatformConfigModule } from '@app/config';
import { SyncWorkerController } from './sync-worker.controller';
import { SyncWorkerService } from './sync-worker.service';

@Module({
  imports: [PlatformConfigModule],
  controllers: [SyncWorkerController],
  providers: [SyncWorkerService],
})
export class SyncWorkerModule {}
