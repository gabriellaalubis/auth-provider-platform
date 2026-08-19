import { Module } from '@nestjs/common';
import { PlatformConfigModule } from '@app/config';
import { AuthDatabaseModule } from '@app/auth-database';
import { SyncWorkerController } from './sync-worker.controller';
import { SyncWorkerService } from './sync-worker.service';

@Module({
  imports: [PlatformConfigModule, AuthDatabaseModule],
  controllers: [SyncWorkerController],
  providers: [SyncWorkerService],
})
export class SyncWorkerModule {}
