import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthPrismaService, DeliveryStatus } from '@app/auth-database';
import type {
  InternalLogoutRequest,
  PlatformEventPayload,
} from '@app/contracts';
import {
  connect,
  type Channel,
  type ChannelModel,
  type ConsumeMessage,
} from 'amqplib';

@Injectable()
export class SyncWorkerService implements OnModuleInit, OnModuleDestroy {
  private connection?: ChannelModel;
  private channel?: Channel;

  constructor(
    private readonly prisma: AuthPrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.connection = await connect(
      this.config.getOrThrow<string>('RABBITMQ_URL'),
    );
    this.channel = await this.connection.createChannel();
    const queue = this.config.getOrThrow<string>('EVENT_QUEUE_NAME');
    await this.channel.assertQueue(queue, { durable: true });
    await this.channel.assertQueue(
      this.config.getOrThrow<string>('EVENT_DLQ_NAME'),
      { durable: true },
    );
    await this.channel.prefetch(4);
    await this.channel.consume(queue, (message) => {
      if (message) void this.process(message);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
  }

  getHello(): string {
    return 'Sync Worker is running';
  }

  private async process(message: ConsumeMessage): Promise<void> {
    if (!this.channel) return;
    let payload: PlatformEventPayload;
    try {
      payload = this.parse(message.content);
    } catch {
      this.channel.sendToQueue(
        this.config.getOrThrow<string>('EVENT_DLQ_NAME'),
        message.content,
        { persistent: true },
      );
      this.channel.ack(message);
      return;
    }
    const attempt = payload.attempt + 1;
    await this.prisma.eventDelivery.update({
      where: { id: payload.deliveryId },
      data: {
        status: DeliveryStatus.PROCESSING,
        attemptCount: attempt,
        lastAttemptAt: new Date(),
      },
    });
    try {
      const request: InternalLogoutRequest = {
        eventId: payload.eventId,
        eventType: payload.eventType,
        userId: payload.userId,
        centralSessionId: payload.centralSessionId,
        applicationId: payload.applicationId,
        reason: payload.reason,
        occurredAt: payload.occurredAt,
      };
      const response = await fetch(payload.logoutNotificationUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-secret': this.config.getOrThrow<string>(
            'INTERNAL_LOGOUT_SECRET',
          ),
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await this.prisma.eventDelivery.update({
        where: { id: payload.deliveryId },
        data: {
          status: DeliveryStatus.SUCCEEDED,
          processedAt: new Date(),
          nextRetryAt: null,
          lastError: null,
        },
      });
      this.channel.ack(message);
    } catch (error: unknown) {
      await this.retry(message, payload, attempt, error);
    }
  }

  private async retry(
    message: ConsumeMessage,
    payload: PlatformEventPayload,
    attempt: number,
    error: unknown,
  ): Promise<void> {
    if (!this.channel) return;
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    const max = this.config.getOrThrow<number>('EVENT_MAX_RETRIES');
    if (attempt >= max) {
      await this.prisma.eventDelivery.update({
        where: { id: payload.deliveryId },
        data: { status: DeliveryStatus.FAILED, lastError: errorMessage },
      });
      this.channel.sendToQueue(
        this.config.getOrThrow<string>('EVENT_DLQ_NAME'),
        Buffer.from(JSON.stringify({ ...payload, attempt })),
        { persistent: true, contentType: 'application/json' },
      );
      this.channel.ack(message);
      return;
    }
    const delay =
      this.config.getOrThrow<number>('EVENT_RETRY_BASE_MS') *
      2 ** (attempt - 1);
    const mainQueue = this.config.getOrThrow<string>('EVENT_QUEUE_NAME');
    const retryQueue = `${mainQueue}.retry.${attempt}`;
    await this.channel.assertQueue(retryQueue, {
      durable: true,
      arguments: {
        'x-message-ttl': delay,
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': mainQueue,
      },
    });
    await this.prisma.eventDelivery.update({
      where: { id: payload.deliveryId },
      data: {
        status: DeliveryStatus.RETRYING,
        nextRetryAt: new Date(Date.now() + delay),
        lastError: errorMessage,
      },
    });
    this.channel.sendToQueue(
      retryQueue,
      Buffer.from(JSON.stringify({ ...payload, attempt })),
      { persistent: true },
    );
    this.channel.ack(message);
  }

  private parse(content: Buffer): PlatformEventPayload {
    const value: unknown = JSON.parse(content.toString('utf8'));
    if (typeof value !== 'object' || value === null)
      throw new Error('Invalid event');
    const data = value as Record<string, unknown>;
    if (
      typeof data.eventId !== 'string' ||
      typeof data.deliveryId !== 'string' ||
      typeof data.userId !== 'string' ||
      typeof data.applicationId !== 'string' ||
      typeof data.logoutNotificationUrl !== 'string' ||
      typeof data.attempt !== 'number'
    )
      throw new Error('Invalid event');
    return value as PlatformEventPayload;
  }
}
