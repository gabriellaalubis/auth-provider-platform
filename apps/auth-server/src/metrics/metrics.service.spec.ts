import { ConfigService } from '@nestjs/config';
import { connect } from 'amqplib';
import { MetricsService } from './metrics.service';

jest.mock('amqplib', () => ({ connect: jest.fn() }));

const mockedConnect = jest.mocked(connect);

describe('MetricsService', () => {
  const closeChannel = jest.fn();
  const closeConnection = jest.fn();
  const assertQueue = jest.fn();
  let service: MetricsService;

  beforeEach(() => {
    jest.clearAllMocks();
    assertQueue
      .mockResolvedValueOnce({ messageCount: 3, consumerCount: 1 })
      .mockResolvedValueOnce({ messageCount: 2, consumerCount: 0 })
      .mockResolvedValue({ messageCount: 1, consumerCount: 0 });
    closeChannel.mockResolvedValue(undefined);
    closeConnection.mockResolvedValue(undefined);
    mockedConnect.mockResolvedValue({
      createChannel: jest.fn().mockResolvedValue({
        assertQueue,
        close: closeChannel,
      }),
      close: closeConnection,
    } as never);
    service = new MetricsService({
      getOrThrow: jest.fn((key: string) => {
        const values: Record<string, string | number> = {
          RABBITMQ_URL: 'amqp://rabbitmq:5672',
          EVENT_QUEUE_NAME: 'sso.events',
          EVENT_DLQ_NAME: 'sso.events.dlq',
          EVENT_MAX_RETRIES: 3,
          EVENT_RETRY_BASE_MS: 1000,
        };
        return values[key];
      }),
    } as unknown as ConfigService);
  });

  it('calculates HTTP and real queue metrics', async () => {
    service.recordRequest(10, 200);
    service.recordRequest(30, 401);

    const snapshot = await service.getSnapshot();

    expect(snapshot.http).toMatchObject({
      totalRequests: 2,
      requestsLastMinute: 2,
      totalErrors: 1,
      errorsLastMinute: 1,
      errorRatePercent: 50,
      averageLatencyMilliseconds: 20,
      p95LatencyMilliseconds: 30,
    });
    expect(snapshot.queues).toEqual({
      available: true,
      mainDepth: 3,
      retryDepth: 2,
      deadLetterDepth: 2,
      consumerCount: 1,
    });
  });

  it('reports unavailable queue metrics without sensitive errors', async () => {
    mockedConnect.mockRejectedValue(new Error('amqp://user:password@host'));

    const snapshot = await service.getSnapshot();

    expect(snapshot.queues).toEqual({
      available: false,
      mainDepth: null,
      retryDepth: null,
      deadLetterDepth: null,
      consumerCount: null,
    });
    expect(JSON.stringify(snapshot)).not.toContain('password');
  });

  it('exports Prometheus text from the same snapshot', async () => {
    const output = service.toPrometheus(await service.getSnapshot());

    expect(output).toContain('sso_http_requests_total 0');
    expect(output).toContain('sso_queue_messages{queue="main"} 3');
    expect(output).toContain('sso_queue_consumers 1');
  });
});
