import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppAPrismaService, LocalSessionStatus } from '@app/app-a-database';
import type { InternalLogoutRequest } from '@app/contracts';
import { timingSafeEqual } from 'node:crypto';

@Controller('internal')
export class InternalLogoutController {
  constructor(
    private readonly prisma: AppAPrismaService,
    private readonly config: ConfigService,
  ) {}

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Headers('x-internal-secret') secret: string | undefined,
    @Body() body: InternalLogoutRequest,
  ): Promise<void> {
    if (!secret || !this.secretMatches(secret)) {
      throw new UnauthorizedException('Internal authentication failed');
    }
    if (!body.eventId || !body.userId || !body.eventType) {
      throw new UnauthorizedException('Internal request is invalid');
    }
    await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.processedEvent.findUnique({
        where: { eventId: body.eventId },
      });
      if (existing) return;
      const revoked = await transaction.localSession.updateMany({
        where: {
          externalUserId: body.userId,
          status: LocalSessionStatus.ACTIVE,
          ...(body.centralSessionId && {
            centralSessionId: body.centralSessionId,
          }),
        },
        data: {
          status: LocalSessionStatus.REVOKED,
          revokedAt: new Date(),
          revokeReason: body.reason,
        },
      });
      await transaction.processedEvent.create({
        data: {
          eventId: body.eventId,
          eventType: body.eventType,
          result: `Revoked ${revoked.count} local session(s)`,
        },
      });
      await transaction.activityLog.create({
        data: {
          eventType: body.eventType,
          message: `Provider event processed: ${body.reason}`,
          correlationId: body.eventId,
        },
      });
    });
  }

  private secretMatches(received: string): boolean {
    const expected = Buffer.from(
      this.config.getOrThrow<string>('INTERNAL_LOGOUT_SECRET'),
    );
    const actual = Buffer.from(received);
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }
}
