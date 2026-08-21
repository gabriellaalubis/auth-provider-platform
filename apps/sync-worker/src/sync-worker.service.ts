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
  private consumerTag?: string;
  private shuttingDown = false;
  private readonly inFlight = new Set<Promise<void>>();
  private connecting?: Promise<void>;
  private reconnectTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: AuthPrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.connectIfNeeded();
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
        this.consumerTag = undefined;
        this.scheduleReconnect();
      }
    });
    const channel = await connection.createChannel();
    const queue = this.config.getOrThrow<string>('EVENT_QUEUE_NAME');
    await channel.assertQueue(queue, { durable: true });
    await channel.assertQueue(
      this.config.getOrThrow<string>('EVENT_DLQ_NAME'),
      { durable: true },
    );
    await channel.prefetch(4);
    const consumer = await channel.consume(queue, (message) => {
      if (!message) return;
      if (this.shuttingDown) {
        channel.nack(message, false, true);
        return;
      }
      const operation = this.process(message, channel);
      const tracked = operation
        .catch(() => this.requeue(message, channel))
        .finally(() => this.inFlight.delete(tracked));
      this.inFlight.add(tracked);
    });
    if (this.shuttingDown) {
      await channel.cancel(consumer.consumerTag);
      await channel.close();
      await connection.close();
      return;
    }
    this.connection = connection;
    this.channel = channel;
    this.consumerTag = consumer.consumerTag;
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.channel && this.consumerTag) {
      await this.channel.cancel(this.consumerTag);
    }
    await this.waitForInFlightMessages();
    await this.channel?.close();
    await this.connection?.close();
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

  private scheduleReconnect(): void {
    if (this.shuttingDown || this.reconnectTimer) return;
    const delay = this.config.getOrThrow<number>('EVENT_RETRY_BASE_MS');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connectIfNeeded().catch(() => this.scheduleReconnect());
    }, delay);
  }

  getHello(): string {
    return 'Sync Worker is running';
  }

  private async process(
    message: ConsumeMessage,
    channel: Channel,
  ): Promise<void> {
    let payload: PlatformEventPayload;
    try {
      payload = this.parse(message.content);
    } catch {
      channel.sendToQueue(
        this.config.getOrThrow<string>('EVENT_DLQ_NAME'),
        message.content,
        { persistent: true },
      );
      channel.ack(message);
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
      channel.ack(message);
    } catch (error: unknown) {
      await this.retry(message, payload, attempt, error, channel);
    }
  }

  private async retry(
    message: ConsumeMessage,
    payload: PlatformEventPayload,
    attempt: number,
    error: unknown,
    channel: Channel,
  ): Promise<void> {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    const max = this.config.getOrThrow<number>('EVENT_MAX_RETRIES');
    if (attempt >= max) {
      await this.prisma.eventDelivery.update({
        where: { id: payload.deliveryId },
        data: { status: DeliveryStatus.FAILED, lastError: errorMessage },
      });
      channel.sendToQueue(
        this.config.getOrThrow<string>('EVENT_DLQ_NAME'),
        Buffer.from(JSON.stringify({ ...payload, attempt })),
        { persistent: true, contentType: 'application/json' },
      );
      channel.ack(message);
      return;
    }
    const delay =
      this.config.getOrThrow<number>('EVENT_RETRY_BASE_MS') *
      2 ** (attempt - 1);
    const mainQueue = this.config.getOrThrow<string>('EVENT_QUEUE_NAME');
    const retryQueue = `${mainQueue}.retry.${attempt}`;
    await channel.assertQueue(retryQueue, {
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
    channel.sendToQueue(
      retryQueue,
      Buffer.from(JSON.stringify({ ...payload, attempt })),
      { persistent: true },
    );
    channel.ack(message);
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

  private async waitForInFlightMessages(): Promise<void> {
    if (this.inFlight.size === 0) return;
    const timeout = this.config.getOrThrow<number>('SHUTDOWN_TIMEOUT_MS');
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeout);
    });

    try {
      await Promise.race([
        Promise.allSettled([...this.inFlight]).then(() => undefined),
        deadline,
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private requeue(message: ConsumeMessage, channel: Channel): void {
    try {
      channel.nack(message, false, true);
    } catch (error: unknown) {
      void error;
    }
  }
}
