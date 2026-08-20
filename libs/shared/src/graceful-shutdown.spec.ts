import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { GracefulShutdownManager } from './graceful-shutdown';

describe('GracefulShutdownManager', () => {
  it('stops HTTP traffic before closing application resources', async () => {
    const order: string[] = [];
    const closeIdleConnections = jest.fn();
    const server = {
      close: jest.fn((callback: () => void) => {
        order.push('http');
        callback();
      }),
      closeIdleConnections,
    } as unknown as Server;
    const closeApplication = jest.fn().mockImplementation(() => {
      order.push('resources');
      return Promise.resolve();
    });
    const app = {
      getHttpServer: jest.fn().mockReturnValue(server),
      close: closeApplication,
    } as unknown as INestApplication;
    const logger = { log: jest.fn(), warn: jest.fn() };
    const manager = new GracefulShutdownManager(app, 100, logger as never);

    await manager.shutdown('SIGTERM');

    expect(order).toEqual(['http', 'resources']);
    expect(closeIdleConnections).toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('runs shutdown only once when multiple signals arrive', async () => {
    const closeServer = jest.fn((callback: () => void) => callback());
    const server = {
      close: closeServer,
      closeIdleConnections: jest.fn(),
    } as unknown as Server;
    const closeApplication = jest.fn().mockResolvedValue(undefined);
    const app = {
      getHttpServer: jest.fn().mockReturnValue(server),
      close: closeApplication,
    } as unknown as INestApplication;
    const manager = new GracefulShutdownManager(app, 100, {
      log: jest.fn(),
      warn: jest.fn(),
    } as never);

    await Promise.all([
      manager.shutdown('SIGTERM'),
      manager.shutdown('SIGINT'),
    ]);

    expect(closeServer).toHaveBeenCalledTimes(1);
    expect(closeApplication).toHaveBeenCalledTimes(1);
  });
});
