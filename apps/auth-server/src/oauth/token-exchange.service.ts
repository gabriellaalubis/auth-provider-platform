import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApplicationStatus,
  AuthorizationCodeStatus,
  AuthPrismaService,
  SessionStatus,
  UserStatus,
} from '@app/auth-database';
import type { TokenResponse } from '@app/contracts';
import { PasswordService, TokenService } from '@app/security';
import { TokenRequestDto } from './dto/token-request.dto';

@Injectable()
export class TokenExchangeService {
  constructor(
    private readonly authPrisma: AuthPrismaService,
    private readonly configService: ConfigService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  async exchange(dto: TokenRequestDto): Promise<TokenResponse> {
    const invalidGrant = new BadRequestException(
      'The authorization grant is invalid',
    );

    const now = new Date();
    const codeHash = this.tokenService.hash(dto.code);
    const authorizationCode =
      await this.authPrisma.authorizationCode.findUnique({
        where: { codeHash },
        include: {
          application: true,
          user: true,
          centralSession: true,
        },
      });

    if (!authorizationCode) {
      throw invalidGrant;
    }

    const clientSecretValid = await this.passwordService.verify(
      authorizationCode.application.clientSecretHash,
      dto.client_secret,
    );
    const expectedChallenge = this.tokenService.createPkceChallenge(
      dto.code_verifier,
    );

    if (
      authorizationCode.status !== AuthorizationCodeStatus.ACTIVE ||
      authorizationCode.usedAt !== null ||
      authorizationCode.expiresAt <= now ||
      authorizationCode.application.clientId !== dto.client_id ||
      authorizationCode.redirectUri !== dto.redirect_uri ||
      !clientSecretValid ||
      authorizationCode.codeChallenge !== expectedChallenge ||
      authorizationCode.codeChallengeMethod !== 'S256' ||
      authorizationCode.application.status !== ApplicationStatus.ACTIVE ||
      authorizationCode.user.status !== UserStatus.ACTIVE ||
      authorizationCode.centralSession.status !== SessionStatus.ACTIVE ||
      authorizationCode.centralSession.revokedAt !== null ||
      authorizationCode.centralSession.expiresAt <= now
    ) {
      throw invalidGrant;
    }

    const accessToken = this.tokenService.generateOpaqueToken();
    const tokenHash = this.tokenService.hash(accessToken);
    const ttlSeconds = this.configService.getOrThrow<number>(
      'ACCESS_TOKEN_TTL_SECONDS',
    );
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    await this.authPrisma.$transaction(async (transaction) => {
      const consumed = await transaction.authorizationCode.updateMany({
        where: {
          id: authorizationCode.id,
          status: AuthorizationCodeStatus.ACTIVE,
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: {
          status: AuthorizationCodeStatus.USED,
          usedAt: now,
        },
      });

      if (consumed.count !== 1) {
        throw invalidGrant;
      }

      await transaction.accessToken.create({
        data: {
          tokenHash,
          userId: authorizationCode.userId,
          applicationId: authorizationCode.applicationId,
          centralSessionId: authorizationCode.centralSessionId,
          scopes: [],
          expiresAt,
        },
      });

      await transaction.auditLog.create({
        data: {
          eventType: 'TOKEN_ISSUED',
          userId: authorizationCode.userId,
          applicationId: authorizationCode.applicationId,
          sessionId: authorizationCode.centralSessionId,
          result: 'success',
        },
      });
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ttlSeconds,
    };
  }
}
