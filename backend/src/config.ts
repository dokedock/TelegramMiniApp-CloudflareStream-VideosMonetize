import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  APP_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(8000),
  HOST: z.string().default('127.0.0.1'),
  FRONTEND_ORIGIN: z.string().default('http://localhost:5173'),
  ADMIN_PASSWORD: z.string().default('admin123'),
  DATABASE_URL: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_PAYMENT_PROVIDER_TOKEN: z.string().optional(),
  DEV_TELEGRAM_USER_ID: z.coerce.bigint().default(10001n),
  DEV_TELEGRAM_USERNAME: z.string().default('devbuyer'),
  CLOUDFLARE_STREAM_SIGNING_KEY_ID: z.string().optional(),
  CLOUDFLARE_STREAM_SIGNING_PRIVATE_KEY: z.string().optional(),
  TOKEN_TTL_SECONDS: z.coerce.number().default(900),
  OFFICIAL_WATERMARK_TEXT: z.string().default('Official'),
  MOCK_PAYMENTS: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
});

export const config = envSchema.parse(process.env);

export const isDevelopment = config.APP_ENV === 'development';
