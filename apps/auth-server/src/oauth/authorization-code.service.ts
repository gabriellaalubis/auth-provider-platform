import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthPrismaService } from '@app/auth-database';
import { TokenService } from '@app/security';
import { PolicyEvaluatorService } from '../authorization/policy-evaluator.service';

export interface IssuedAuthorizationCode {
  code: string;
  redirectUri: string;
  state: string;
}

@Injectable()
export class AuthorizationCodeService {
  constructor(
    private readonly authPrisma: AuthPrismaService,
    private readonly configService: ConfigService,
    private readonly tokenService: TokenService,
    private readonly policyEvaluator: PolicyEvaluatorService,
  ) {}

  async issue(input: {
    userId: string;
    centralSessionId: string;
    clientId: string;
    redirectUri: string;
    state: string;
    codeChallenge: string;
  }): Promise<IssuedAuthorizationCode> {
    const policy = await this.policyEvaluator.evaluate(
      input.userId,
      input.clientId,
      input.redirectUri,
    );
    const code = this.tokenService.generateOpaqueToken();
    const codeHash = this.tokenService.hash(code);
    const ttlSeconds = this.configService.getOrThrow<number>(
      'AUTHORIZATION_CODE_TTL_SECONDS',
    );
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    await this.authPrisma.$transaction(async (transaction) => {
      await transaction.authorizationCode.create({
        data: {
          codeHash,
          userId: input.userId,
          applicationId: policy.applicationId,
          centralSessionId: input.centralSessionId,
          redirectUri: input.redirectUri,
          codeChallenge: input.codeChallenge,
          codeChallengeMethod: 'S256',
          expiresAt,
        },
      });

      await transaction.auditLog.create({
        data: {
          eventType: 'AUTHORIZATION_CODE_ISSUED',
          userId: input.userId,
          applicationId: policy.applicationId,
          sessionId: input.centralSessionId,
          result: 'success',
        },
      });
    });

    return { code, redirectUri: input.redirectUri, state: input.state };
  }
}
