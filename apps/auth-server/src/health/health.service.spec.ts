import { ConfigService } from '@nestjs/config';
import { AuthPrismaService } from '@app/auth-database';
import { HealthService } from './health.service';

jest.mock('amqplib', () => ({ connect: jest.fn() }));

import { connect } from 'amqplib';

const mockedConnect = jest.mocked(connect);

describe('HealthService', () => {
  const queryRaw = jest.fn();
  const close = jest.fn();
  let service: HealthService;

  beforeEach(() => {
    jest.clearAllMocks();
    queryRaw.mockResolvedValue([{ result: 1 }]);
    close.mockResolvedValue(undefined);
    mockedConnect.mockResolvedValue({ close } as never);
    service = new HealthService(
      { $queryRaw: queryRaw } as unknown as AuthPrismaService,
      {
        getOrThrow: jest.fn().mockReturnValue('amqp://rabbitmq:5672'),
      } as unknown as ConfigService,
    );
  });

  it('reports liveness without checking external dependencies', () => {
    expect(service.getLiveness()).toEqual({
      status: 'live',
      service: 'auth-server',
    });
    expect(queryRaw).not.toHaveBeenCalled();
    expect(mockedConnect).not.toHaveBeenCalled();
  });

  it('reports ready when the database and broker are available', async () => {
    await expect(service.getReadiness()).resolves.toEqual({
      status: 'ready',
      service: 'auth-server',
      components: {
        database: { status: 'up' },
        messageBroker: { status: 'up' },
      },
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('identifies unavailable dependencies without exposing errors', async () => {
    queryRaw.mockRejectedValue(new Error('sensitive database address'));
    mockedConnect.mockRejectedValue(new Error('sensitive broker password'));

    await expect(service.getReadiness()).resolves.toEqual({
      status: 'not_ready',
      service: 'auth-server',
      components: {
        database: { status: 'down' },
        messageBroker: { status: 'down' },
      },
    });
  });
});
