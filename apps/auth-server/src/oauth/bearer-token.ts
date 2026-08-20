import { UnauthorizedException } from '@nestjs/common';

export function extractBearerToken(header: string | undefined): string {
  if (!header) {
    throw new UnauthorizedException('The access token is invalid');
  }

  const [scheme, token, extra] = header.split(' ');
  if (scheme !== 'Bearer' || !token || extra !== undefined) {
    throw new UnauthorizedException('The access token is invalid');
  }

  return token;
}
