import { TokenService } from './token.service';

describe('TokenService', () => {
  const service = new TokenService();

  it('menghasilkan opaque token yang berbeda pada setiap pemanggilan', () => {
    const first = service.generateOpaqueToken();
    const second = service.generateOpaqueToken();

    expect(first).not.toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('menghasilkan hash SHA-256 deterministik sepanjang 64 hex', () => {
    const first = service.hash('nilai-yang-sama');
    const second = service.hash('nilai-yang-sama');

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it('menghasilkan PKCE challenge S256 base64url', () => {
    const challenge = service.createPkceChallenge(
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~',
    );

    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge).not.toContain('=');
  });
});
