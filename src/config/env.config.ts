import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

/**
 * Zod Schema for Fail-Fast Environment Configuration
 * Strictly enforces 512-bit JWT secret, 256-bit AES-256-GCM cipher key,
 * and MongoDB Atlas M0 Free Tier requirements.
 */
const envSchema = z.object({
  PORT: z
    .coerce
    .number()
    .int()
    .positive()
    .default(5000),

  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  CLIENT_ORIGIN: z
    .string()
    .min(1, 'CLIENT_ORIGIN is required')
    .default('http://localhost:4200'),

  MONGODB_URI: z
    .string({
      required_error: 'MONGODB_URI is required for Atlas database connection'
    })
    .min(1, 'MONGODB_URI cannot be empty')
    .refine(
      (uri) => uri.startsWith('mongodb://') || uri.startsWith('mongodb+srv://'),
      { message: 'MONGODB_URI must start with "mongodb://" or "mongodb+srv://"' }
    ),

  // Security: Minimum 512-bit (64 bytes / min 64 ASCII characters) for HS512 JWT signature
  JWT_SECRET: z
    .string({
      required_error: 'JWT_SECRET is required'
    })
    .min(64, 'JWT_SECRET must be at least 64 characters (512 bits) to guarantee cryptographic integrity'),

  JWT_EXPIRES_IN: z
    .string()
    .default('7d'),

  // Cryptography: 32-byte (256-bit) hexadecimal string for AES-256-GCM YouTube ID cipher
  VIDEO_CIPHER_SECRET: z
    .string({
      required_error: 'VIDEO_CIPHER_SECRET is required for lecture DRM encryption'
    })
    .regex(
      /^[0-9a-fA-F]{64}$/,
      'VIDEO_CIPHER_SECRET must be exactly 64 hexadecimal characters representing a 32-byte (256-bit) key'
    ),

  GOOGLE_CLIENT_ID: z
    .string({
      required_error: 'GOOGLE_CLIENT_ID is required for Google OAuth 2.0 authentication'
    })
    .min(1, 'GOOGLE_CLIENT_ID cannot be empty'),

  CLOUDINARY_CLOUD_NAME: z
    .string({
      required_error: 'CLOUDINARY_CLOUD_NAME is required for student homework upload signatures'
    })
    .min(1, 'CLOUDINARY_CLOUD_NAME cannot be empty'),

  CLOUDINARY_API_KEY: z
    .string({
      required_error: 'CLOUDINARY_API_KEY is required for student homework upload signatures'
    })
    .min(1, 'CLOUDINARY_API_KEY cannot be empty'),

  CLOUDINARY_API_SECRET: z
    .string({
      required_error: 'CLOUDINARY_API_SECRET is required for student homework upload signatures'
    })
    .min(1, 'CLOUDINARY_API_SECRET cannot be empty')
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Validates process.env against envSchema.
 * Fails fast with descriptive diagnostics if configuration is violated.
 */
function validateEnv(): EnvConfig {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formattedErrors = result.error.errors
      .map((err) => `  - [${err.path.join('.')}]: ${err.message}`)
      .join('\n');

    console.error('\n❌ FATAL: Environment Variable Validation Failed:');
    console.error(formattedErrors);
    console.error('\nPlease verify your .env file matches .env.example specifications.\n');

    throw new Error('Environment configuration validation failed. Terminating process.');
  }

  return Object.freeze(result.data);
}

export const env: EnvConfig = validateEnv();
export const envConfig = env;

