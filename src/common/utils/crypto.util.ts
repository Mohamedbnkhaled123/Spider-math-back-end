import crypto from 'crypto';
import { env } from '../../config/env.config';
import { AppError } from './app-error.util';
import { ERROR_CODES } from '../constants/error-codes.constant';

/**
 * Spider Math Media DRM Crypto Proxy Utility
 * Strictly enforces AES-256-GCM authenticated encryption for unlisted YouTube video IDs.
 * Guarantees zero plaintext YouTube video IDs in client network responses.
 */
export class CryptoProxyService {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH_BYTES = 12; // 96 bits recommended for GCM
  private static readonly AUTH_TAG_LENGTH_BYTES = 16; // 128-bit authentication tag

  private static getKey(): Buffer {
    return Buffer.from(env.VIDEO_CIPHER_SECRET, 'hex');
  }

  /**
   * Encrypts plaintext YouTube ID into an AES-256-GCM cipher string:
   * Format: `${ivHex}:${authTagHex}:${ciphertextHex}`
   */
  public static encrypt(plainText: string): string {
    try {
      const key = this.getKey();
      const iv = crypto.randomBytes(this.IV_LENGTH_BYTES);
      const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);

      const encrypted = Buffer.concat([
        cipher.update(plainText, 'utf8'),
        cipher.final()
      ]);

      const authTag = cipher.getAuthTag();

      return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
    } catch (err: any) {
      throw new AppError(
        `Failed to encrypt video resource identifier: ${err.message}`,
        500,
        ERROR_CODES.CRYPTO_CIPHER_ERROR_500
      );
    }
  }

  /**
   * Extracts clean 11-character YouTube video ID from URL or raw ID string.
   */
  public static extractYoutubeId(urlOrId: string): string {
    if (!urlOrId) return '';
    const clean = urlOrId.trim();
    if (clean.length === 11 && !clean.includes('/') && !clean.includes('?') && !clean.includes('.')) {
      return clean;
    }
    const match = clean.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    if (match && match[1]) {
      return match[1];
    }
    return clean.length === 11 ? clean : '';
  }

  /**
   * Decrypts AES-256-GCM cipher string verifying cryptographic authenticity.
   * Seamlessly handles legacy base64-encoded strings (prefixed with U2FsdGVkX1_) or raw IDs.
   */
  public static decrypt(cipherString: string): string {
    if (!cipherString) return '';

    // Handle legacy base64 format safely
    if (cipherString.startsWith('U2FsdGVkX1_')) {
      try {
        const rawBase64 = cipherString.replace('U2FsdGVkX1_', '');
        return Buffer.from(rawBase64, 'base64').toString('utf8');
      } catch {
        return cipherString;
      }
    }

    // If not in iv:authTag:cipher format, return string as-is
    if (!cipherString.includes(':')) {
      return cipherString;
    }

    try {
      const parts = cipherString.split(':');
      if (parts.length !== 3) {
        throw new Error('Malformed cipher string format. Expected iv:authTag:ciphertext');
      }

      const [ivHex, authTagHex, cipherHex] = parts;
      const key = this.getKey();
      const iv = Buffer.from(ivHex!, 'hex');
      const authTag = Buffer.from(authTagHex!, 'hex');
      const cipherText = Buffer.from(cipherHex!, 'hex');

      if (iv.length !== this.IV_LENGTH_BYTES || authTag.length !== this.AUTH_TAG_LENGTH_BYTES) {
        throw new Error('Invalid IV or Auth Tag length in cipher payload');
      }

      const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([
        decipher.update(cipherText),
        decipher.final()
      ]);

      return decrypted.toString('utf8');
    } catch (err: any) {
      throw new AppError(
        `Failed to decrypt protected video payload (authentication tag mismatch or corrupted data): ${err.message}`,
        500,
        ERROR_CODES.CRYPTO_CIPHER_ERROR_500
      );
    }
  }

  /**
   * Generates a short-lived session-bound playback token.
   * Encapsulates videoId, studentId, deviceUuid, and timestamp.
   */
  public static createSessionPlaybackToken(params: {
    rawVideoId: string;
    studentId: string;
    deviceUuid: string;
    expiresInSec?: number;
  }): string {
    const expiresAt = Date.now() + (params.expiresInSec || 300) * 1000;
    const sessionPayload = JSON.stringify({
      v: params.rawVideoId,
      s: params.studentId,
      d: params.deviceUuid,
      exp: expiresAt
    });

    return this.encrypt(sessionPayload);
  }
}
