import crypto from 'crypto';

const KEY_LENGTH = 64;

/**
 * Generates a cryptographically random salted scrypt hash for secret access codes.
 */
export function hashAccessCode(rawCode: string): string {
  const normalized = (rawCode || '').trim();
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(normalized, salt, KEY_LENGTH).toString('hex');
  return `${salt}:${derivedKey}`;
}

/**
 * Verifies a plaintext access code against a stored salted scrypt hash in constant time.
 */
export function verifyAccessCode(rawCode: string, storedHash?: string | null): boolean {
  if (!rawCode || !storedHash || !storedHash.includes(':')) {
    return false;
  }
  const parts = storedHash.split(':');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return false;
  }
  const [salt, expectedHex] = parts;
  try {
    const actualBuf = crypto.scryptSync(rawCode.trim(), salt, KEY_LENGTH);
    const expectedBuf = Buffer.from(expectedHex, 'hex');
    if (actualBuf.length !== expectedBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(actualBuf, expectedBuf);
  } catch {
    return false;
  }
}

/**
 * Generates a high-entropy cryptographic device trust secret for trusted developer devices.
 */
export function generateDeviceTrustToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Computes deterministic SHA-256 hex digest for storing a trusted device secret at rest.
 */
export function hashDeviceTrustToken(rawToken: string): string {
  return crypto.createHash('sha256').update((rawToken || '').trim(), 'utf8').digest('hex');
}

/**
 * Verifies a presented device trust secret against a stored SHA-256 hash in constant time.
 */
export function verifyDeviceTrustToken(rawToken?: string | null, storedHash?: string | null): boolean {
  if (!rawToken || !storedHash) {
    return false;
  }
  try {
    const actualBuf = Buffer.from(hashDeviceTrustToken(rawToken), 'hex');
    const expectedBuf = Buffer.from(storedHash.trim(), 'hex');
    if (actualBuf.length === 0 || actualBuf.length !== expectedBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(actualBuf, expectedBuf);
  } catch {
    return false;
  }
}
