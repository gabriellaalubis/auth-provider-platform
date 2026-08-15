import { PasswordService } from './password.service';

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(() => {
    service = new PasswordService();
  });

  describe('hash', () => {
    it('should not return the original password', async () => {
      const password = 'TestPassword123!';

      const hash = await service.hash(password);

      expect(hash).not.toBe(password);
    });

    it('should produce different hashes for the same password', async () => {
      const password = 'TestPassword123!';

      const hash1 = await service.hash(password);
      const hash2 = await service.hash(password);

      expect(hash1).not.toBe(hash2);
    });

    it('should produce an Argon2id hash', async () => {
      const password = 'TestPassword123!';

      const hash = await service.hash(password);

      expect(hash).toContain('$argon2id$');
    });

    it('should reject an empty password', async () => {
      await expect(service.hash('')).rejects.toThrow();
    });
  });

  describe('verify', () => {
    it('should return true for the correct password', async () => {
      const password = 'TestPassword123!';
      const hash = await service.hash(password);

      await expect(service.verify(hash, password)).resolves.toBe(true);
    });

    it('should return false for the wrong password', async () => {
      const password = 'TestPassword123!';
      const wrongPassword = 'WrongPassword456!';
      const hash = await service.hash(password);

      await expect(service.verify(hash, wrongPassword)).resolves.toBe(false);
    });

    it('should return false for an invalid hash', async () => {
      await expect(
        service.verify('this-is-not-a-valid-argon2-hash', 'TestPassword123!'),
      ).resolves.toBe(false);
    });

    it('should return false for an empty password', async () => {
      const hash = await service.hash('TestPassword123!');

      await expect(service.verify(hash, '')).resolves.toBe(false);
    });
  });
});
