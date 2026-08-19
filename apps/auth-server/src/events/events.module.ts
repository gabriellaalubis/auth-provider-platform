import { Module } from '@nestjs/common';
import { AuthDatabaseModule } from '@app/auth-database';
import { PlatformConfigModule } from '@app/config';
import { OutboxPublisherService } from './outbox-publisher.service';

@Module({
  imports: [AuthDatabaseModule, PlatformConfigModule],
  providers: [OutboxPublisherService],
  exports: [OutboxPublisherService],
})
export class EventsModule {}
