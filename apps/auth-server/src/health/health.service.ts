import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthPrismaService } from '@app/auth-database';
import { connect } from 'amqplib';

export interface ComponentHealth {
  status: 'up' | 'down';
}

export interface LivenessResponse {
  status: 'live';
  service: 'auth-server';
}

export interface ReadinessResponse {
  status: 'ready' | 'not_ready';
  service: 'auth-server';
  components: {
    database: ComponentHealth;
    messageBroker: ComponentHealth;
  };
}

@Injectable()
export class HealthService {
  private readonly timeoutMilliseconds = 3000;

  constructor(
    private readonly prisma: AuthPrismaService,
    private readonly config: ConfigService,
  ) {}

  getLiveness(): LivenessResponse {
    return { status: 'live', service: 'auth-server' };
  }

  async getReadiness(): Promise<ReadinessResponse> {
    const [database, messageBroker] = await Promise.all([
      this.checkDatabase(),
      this.checkMessageBroker(),
    ]);
    const ready = database.status === 'up' && messageBroker.status === 'up';

    return {
      status: ready ? 'ready' : 'not_ready',
      service: 'auth-server',
      components: { database, messageBroker },
    };
  }

  private async checkDatabase(): Promise<ComponentHealth> {
    try {
      await this.withTimeout(this.prisma.$queryRaw`SELECT 1`);
      return { status: 'up' };
    } catch {
      return { status: 'down' };
    }
  }

  private async checkMessageBroker(): Promise<ComponentHealth> {
    let connection: Awaited<ReturnType<typeof connect>> | undefined;

    try {
      connection = await this.withTimeout(
        connect(this.config.getOrThrow<string>('RABBITMQ_URL'), {
          timeout: this.timeoutMilliseconds,
        }),
      );
      return { status: 'up' };
    } catch {
      return { status: 'down' };
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

  private async withTimeout<T>(operation: Promise<T>): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(
        () => reject(new Error('Health check timed out')),
        this.timeoutMilliseconds,
      );
    });

    try {
      return await Promise.race([operation, timeoutPromise]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
