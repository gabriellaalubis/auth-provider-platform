import { UnauthorizedException } from '@nestjs/common';
import { extractBearerToken } from './bearer-token';

describe('extractBearerToken', () => {
  it('mengambil token dari header Bearer yang valid', () => {
    expect(extractBearerToken('Bearer token-value')).toBe('token-value');
  });

  it.each([
    undefined,
    '',
    'token-value',
    'Basic token-value',
    'Bearer',
    'Bearer token-value extra',
  ])('menolak header tidak valid: %s', (header) => {
    expect(() => extractBearerToken(header)).toThrow(UnauthorizedException);
  });
});
