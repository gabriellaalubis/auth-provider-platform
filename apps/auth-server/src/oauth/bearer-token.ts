import { UnauthorizedException } from '@nestjs/common';

export function extractBearerToken(header: string | undefined): string {
  if (!header) {
    throw new UnauthorizedException('Access token tidak valid');
  }

  const [scheme, token, extra] = header.split(' ');
  if (scheme !== 'Bearer' || !token || extra !== undefined) {
    throw new UnauthorizedException('Access token tidak valid');
  }

  return token;
}
