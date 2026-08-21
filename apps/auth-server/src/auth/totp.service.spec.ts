import { ConfigService } from '@nestjs/config';
import { TotpService } from './totp.service';

describe('TotpService', () => {
  const service = new TotpService({
    getOrThrow: jest.fn().mockReturnValue('x'.repeat(64)),
  } as unknown as ConfigService);

  it('implements the RFC 6238 SHA-1 test vector', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

    expect(service.generateCode(secret, 59_000)).toBe('287082');
  });

  it('accepts the current step and a one-step clock drift', () => {
    const secret = service.generateSecret();
    const time = 1_700_000_000_000;
    const previousCode = service.generateCode(secret, time - 30_000);

    expect(service.verifyCode(secret, previousCode, time)).toBe(true);
    expect(service.verifyCode(secret, 'not-a-code', time)).toBe(false);
  });

  it('encrypts the secret with authenticated encryption', () => {
    const secret = service.generateSecret();
    const encrypted = service.encryptSecret(secret);

    expect(encrypted).not.toContain(secret);
    expect(service.decryptSecret(encrypted)).toBe(secret);
    expect(() => service.decryptSecret(`${encrypted}broken`)).toThrow();
  });
});
