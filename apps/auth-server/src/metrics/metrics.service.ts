import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect } from 'amqplib';

interface RequestSample {
  timestamp: number;
  durationMilliseconds: number;
  statusCode: number;
}

export interface MetricsSnapshot {
  generatedAt: string;
  uptimeSeconds: number;
  http: {
    totalRequests: number;
    requestsLastMinute: number;
    totalErrors: number;
    errorsLastMinute: number;
    errorRatePercent: number;
    averageLatencyMilliseconds: number;
    p95LatencyMilliseconds: number;
  };
  queues: {
    available: boolean;
    mainDepth: number | null;
    retryDepth: number | null;
    deadLetterDepth: number | null;
    consumerCount: number | null;
  };
}

@Injectable()
export class MetricsService {
  private readonly startedAt = Date.now();
  private readonly samples: RequestSample[] = [];
  private totalRequests = 0;
  private totalErrors = 0;

  constructor(private readonly config: ConfigService) {}

  recordRequest(durationMilliseconds: number, statusCode: number): void {
    this.totalRequests += 1;
    if (statusCode >= 400) this.totalErrors += 1;
    this.samples.push({
      timestamp: Date.now(),
      durationMilliseconds,
      statusCode,
    });
    if (this.samples.length > 2000) this.samples.splice(0, 500);
  }

  async getSnapshot(): Promise<MetricsSnapshot> {
    const now = Date.now();
    const recent = this.samples.filter(
      (sample) => sample.timestamp >= now - 60_000,
    );
    const durations = recent
      .map((sample) => sample.durationMilliseconds)
      .sort((left, right) => left - right);
    const errorsLastMinute = recent.filter(
      (sample) => sample.statusCode >= 400,
    ).length;
    const average = durations.length
      ? durations.reduce((total, value) => total + value, 0) / durations.length
      : 0;
    const p95Index = Math.max(0, Math.ceil(durations.length * 0.95) - 1);

    return {
      generatedAt: new Date(now).toISOString(),
      uptimeSeconds: Math.floor((now - this.startedAt) / 1000),
      http: {
        totalRequests: this.totalRequests,
        requestsLastMinute: recent.length,
        totalErrors: this.totalErrors,
        errorsLastMinute,
        errorRatePercent: recent.length
          ? this.round((errorsLastMinute / recent.length) * 100)
          : 0,
        averageLatencyMilliseconds: this.round(average),
        p95LatencyMilliseconds: durations.length
          ? this.round(durations[p95Index])
          : 0,
      },
      queues: await this.readQueueMetrics(),
    };
  }

  toPrometheus(snapshot: MetricsSnapshot): string {
    const queueValue = (value: number | null) => value ?? -1;
    return [
      '# HELP sso_http_requests_total Total measured HTTP requests.',
      '# TYPE sso_http_requests_total counter',
      `sso_http_requests_total ${snapshot.http.totalRequests}`,
      '# HELP sso_http_errors_total Total measured HTTP errors.',
      '# TYPE sso_http_errors_total counter',
      `sso_http_errors_total ${snapshot.http.totalErrors}`,
      '# HELP sso_http_latency_average_milliseconds Average latency during the last minute.',
      '# TYPE sso_http_latency_average_milliseconds gauge',
      `sso_http_latency_average_milliseconds ${snapshot.http.averageLatencyMilliseconds}`,
      '# HELP sso_http_latency_p95_milliseconds P95 latency during the last minute.',
      '# TYPE sso_http_latency_p95_milliseconds gauge',
      `sso_http_latency_p95_milliseconds ${snapshot.http.p95LatencyMilliseconds}`,
      '# HELP sso_queue_messages Current ready messages by queue category.',
      '# TYPE sso_queue_messages gauge',
      `sso_queue_messages{queue="main"} ${queueValue(snapshot.queues.mainDepth)}`,
      `sso_queue_messages{queue="retry"} ${queueValue(snapshot.queues.retryDepth)}`,
      `sso_queue_messages{queue="dead_letter"} ${queueValue(snapshot.queues.deadLetterDepth)}`,
      '# HELP sso_queue_consumers Current consumers on the main event queue.',
      '# TYPE sso_queue_consumers gauge',
      `sso_queue_consumers ${queueValue(snapshot.queues.consumerCount)}`,
      '',
    ].join('\n');
  }

  private async readQueueMetrics(): Promise<MetricsSnapshot['queues']> {
    let connection: Awaited<ReturnType<typeof connect>> | undefined;
    try {
      connection = await connect(
        this.config.getOrThrow<string>('RABBITMQ_URL'),
        { timeout: 2500 },
      );
      const channel = await connection.createChannel();
      const mainQueue = this.config.getOrThrow<string>('EVENT_QUEUE_NAME');
      const deadLetterQueue = this.config.getOrThrow<string>('EVENT_DLQ_NAME');
      const main = await channel.assertQueue(mainQueue, { durable: true });
      const deadLetter = await channel.assertQueue(deadLetterQueue, {
        durable: true,
      });
      const maxRetries = this.config.getOrThrow<number>('EVENT_MAX_RETRIES');
      const retryBase = this.config.getOrThrow<number>('EVENT_RETRY_BASE_MS');
      let retryDepth = 0;
      for (let attempt = 1; attempt < maxRetries; attempt += 1) {
        const retry = await channel.assertQueue(
          `${mainQueue}.retry.${attempt}`,
          {
            durable: true,
            arguments: {
              'x-message-ttl': retryBase * 2 ** (attempt - 1),
              'x-dead-letter-exchange': '',
              'x-dead-letter-routing-key': mainQueue,
            },
          },
        );
        retryDepth += retry.messageCount;
      }
      await channel.close();
      return {
        available: true,
        mainDepth: main.messageCount,
        retryDepth,
        deadLetterDepth: deadLetter.messageCount,
        consumerCount: main.consumerCount,
      };
    } catch {
      return {
        available: false,
        mainDepth: null,
        retryDepth: null,
        deadLetterDepth: null,
        consumerCount: null,
      };
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (error: unknown) {
          void error;
        }
      }
    }
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
