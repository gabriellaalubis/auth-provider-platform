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
  private shuttingDown = false;
  private activePublish?: Promise<void>;
  private connecting?: Promise<void>;

  constructor(
    private readonly prisma: AuthPrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.connectIfNeeded();
    const interval = this.config.getOrThrow<number>(
      'EVENT_PUBLISH_INTERVAL_MS',
    );
    this.timer = setInterval(
      () => void this.publishBatch().catch(() => undefined),
      interval,
    );
    await this.publishBatch();
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    if (this.timer) clearInterval(this.timer);
    if (this.activePublish) {
      await this.waitForPublish(this.activePublish);
    }
    try {
      await this.channel?.waitForConfirms();
    } catch (error: unknown) {
      void error;
    }
    await this.channel?.close();
    await this.connection?.close();
  }

  async publishBatch(): Promise<void> {
    if (this.publishing || this.shuttingDown) return;
    this.publishing = true;
    const operation = this.connectIfNeeded().then(() =>
      this.publishPendingEvents(),
    );
    this.activePublish = operation;
    try {
      await operation;
    } finally {
      this.publishing = false;
      if (this.activePublish === operation) this.activePublish = undefined;
    }
  }

  private async publishPendingEvents(): Promise<void> {
    if (!this.channel) return;
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
          reason: typeof source.reason === 'string' ? source.reason : 'revoked',
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
  }

  private async connectIfNeeded(): Promise<void> {
    if (this.channel || this.shuttingDown) return;
    if (this.connecting) return this.connecting;

    const operation = this.openConnection();
    this.connecting = operation;
    try {
      await operation;
    } finally {
      if (this.connecting === operation) this.connecting = undefined;
    }
  }

  private async openConnection(): Promise<void> {
    const connection = await connect(
      this.config.getOrThrow<string>('RABBITMQ_URL'),
    );
    connection.on('error', () => undefined);
    connection.on('close', () => {
      if (this.connection === connection) {
        this.connection = undefined;
        this.channel = undefined;
      }
    });
    const channel = await connection.createConfirmChannel();
    await channel.assertQueue(
      this.config.getOrThrow<string>('EVENT_QUEUE_NAME'),
      { durable: true },
    );
    await channel.assertQueue(
      this.config.getOrThrow<string>('EVENT_DLQ_NAME'),
      { durable: true },
    );
    if (this.shuttingDown) {
      await channel.close();
      await connection.close();
      return;
    }
    this.connection = connection;
    this.channel = channel;
  }

  private async waitForPublish(operation: Promise<void>): Promise<void> {
    const timeout = this.config.getOrThrow<number>('SHUTDOWN_TIMEOUT_MS');
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeout);
    });

    try {
      await Promise.race([operation.catch(() => undefined), deadline]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
