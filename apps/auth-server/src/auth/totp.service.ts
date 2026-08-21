import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

@Injectable()
export class TotpService {
  constructor(private readonly config: ConfigService) {}

  generateSecret(): string {
    return this.encodeBase32(randomBytes(20));
  }

  createProvisioningUri(email: string, secret: string): string {
    const issuer = 'Admin SSO';
    const label = encodeURIComponent(`${issuer}:${email}`);
    return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
  }

  generateCode(secret: string, time = Date.now()): string {
    const counter = Math.floor(time / 30_000);
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64BE(BigInt(counter));
    const digest = createHmac('sha1', this.decodeBase32(secret))
      .update(buffer)
      .digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const binary =
      ((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff);
    return String(binary % 1_000_000).padStart(6, '0');
  }

  verifyCode(secret: string, code: string, time = Date.now()): boolean {
    if (!/^\d{6}$/.test(code)) return false;
    const received = Buffer.from(code);
    for (const offset of [-30_000, 0, 30_000]) {
      const expected = Buffer.from(this.generateCode(secret, time + offset));
      if (
        received.length === expected.length &&
        timingSafeEqual(received, expected)
      ) {
        return true;
      }
    }
    return false;
  }

  encryptSecret(secret: string): string {
    const initializationVector = randomBytes(12);
    const cipher = createCipheriv(
      'aes-256-gcm',
      this.encryptionKey(),
      initializationVector,
    );
    const ciphertext = Buffer.concat([
      cipher.update(secret, 'utf8'),
      cipher.final(),
    ]);
    const authenticationTag = cipher.getAuthTag();
    return [
      'v1',
      initializationVector.toString('base64url'),
      authenticationTag.toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  decryptSecret(encrypted: string): string {
    const [version, iv, tag, ciphertext] = encrypted.split('.');
    if (version !== 'v1' || !iv || !tag || !ciphertext) {
      throw new Error('Invalid encrypted MFA secret');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey(),
      Buffer.from(iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  private encryptionKey(): Buffer {
    return createHash('sha256')
      .update('mfa-encryption-key-v1\0')
      .update(this.config.getOrThrow<string>('INTERNAL_LOGOUT_SECRET'))
      .digest();
  }

  private encodeBase32(input: Buffer): string {
    let bits = 0;
    let value = 0;
    let output = '';
    for (const byte of input) {
      value = (value << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    return output;
  }

  private decodeBase32(input: string): Buffer {
    let bits = 0;
    let value = 0;
    const output: number[] = [];
    for (const character of input.replaceAll('=', '').toUpperCase()) {
      const index = BASE32_ALPHABET.indexOf(character);
      if (index < 0) throw new Error('Invalid Base32 secret');
      value = (value << 5) | index;
      bits += 5;
      if (bits >= 8) {
        output.push((value >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }
    return Buffer.from(output);
  }
}
