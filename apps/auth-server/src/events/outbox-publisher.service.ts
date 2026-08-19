import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthPrismaService, EventStatus } from '@app/auth-database';
import type { PlatformEventPayload, PlatformEventType } from '@app/contracts';
import { connect, type ChannelModel, type ConfirmChannel } from 'amqplib';

@Injectable()
export class OutboxPublisherService implements OnModuleInit, OnModuleDestroy {
  private connection?: ChannelModel;
  private channel?: ConfirmChannel;
  private timer?: NodeJS.Timeout;
  private publishing = false;

  constructor(
    private readonly prisma: AuthPrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.connection = await connect(
      this.config.getOrThrow<string>('RABBITMQ_URL'),
    );
    this.channel = await this.connection.createConfirmChannel();
    await this.channel.assertQueue(
      this.config.getOrThrow<string>('EVENT_QUEUE_NAME'),
      { durable: true },
    );
    await this.channel.assertQueue(
      this.config.getOrThrow<string>('EVENT_DLQ_NAME'),
      { durable: true },
    );
    const interval = this.config.getOrThrow<number>(
      'EVENT_PUBLISH_INTERVAL_MS',
    );
    this.timer = setInterval(() => void this.publishBatch(), interval);
    await this.publishBatch();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.channel?.close();
    await this.connection?.close();
  }

  async publishBatch(): Promise<void> {
    if (this.publishing || !this.channel) return;
    this.publishing = true;
    try {
      const events = await this.prisma.event.findMany({
        where: { status: EventStatus.PENDING },
        include: {
          deliveries: { include: { application: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: 20,
      });
      for (const event of events) {
        for (const delivery of event.deliveries) {
          const source = event.payload as Record<string, unknown>;
          const payload: PlatformEventPayload = {
            eventId: event.id,
            deliveryId: delivery.id,
            eventType: event.eventType as PlatformEventType,
            userId: event.userId,
            centralSessionId: event.centralSessionId,
            applicationId: delivery.applicationId,
            logoutNotificationUrl: delivery.application.logoutNotificationUrl,
            reason:
              typeof source.reason === 'string' ? source.reason : 'revoked',
            occurredAt: event.createdAt.toISOString(),
            attempt: 0,
            metadata:
              typeof source.metadata === 'object' && source.metadata !== null
                ? (source.metadata as Record<string, unknown>)
                : {},
          };
          this.channel.sendToQueue(
            this.config.getOrThrow<string>('EVENT_QUEUE_NAME'),
            Buffer.from(JSON.stringify(payload)),
            { persistent: true, contentType: 'application/json' },
          );
        }
        await this.channel.waitForConfirms();
        await this.prisma.event.update({
          where: { id: event.id },
          data: { status: EventStatus.PUBLISHED, publishedAt: new Date() },
        });
      }
    } finally {
      this.publishing = false;
    }
  }
}
