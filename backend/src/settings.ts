import { config } from './config.js';
import { prisma } from './db.js';

export const settingKeys = {
  telegramBotToken: 'telegram.botToken',
  telegramPaymentsEnabled: 'payments.telegram.enabled',
  telegramPaymentProviderToken: 'payments.telegram.providerToken',
  legacyTelegramPaymentProviderToken: 'telegram.paymentProviderToken',
  cloudflareAccountId: 'cloudflare.accountId',
  cloudflareApiToken: 'cloudflare.apiToken',
  cloudflareStreamSigningKeyId: 'cloudflare.streamSigningKeyId',
  cloudflareStreamSigningPrivateKey: 'cloudflare.streamSigningPrivateKey',
  demoCloudflareVideoUid: 'cloudflare.demoVideoUid',
  officialWatermarkText: 'watermark.officialText',
  maxConcurrentPlaySessions: 'security.maxConcurrentPlaySessions',
} as const;

export type RuntimeSettings = {
  telegramBotToken?: string;
  telegramPaymentsEnabled: boolean;
  telegramPaymentProviderToken?: string;
  cloudflareAccountId?: string;
  cloudflareApiToken?: string;
  cloudflareStreamSigningKeyId?: string;
  cloudflareStreamSigningPrivateKey?: string;
  demoCloudflareVideoUid?: string;
  officialWatermarkText: string;
  maxConcurrentPlaySessions: number;
};

const envFallbacks: RuntimeSettings = {
  telegramBotToken: config.TELEGRAM_BOT_TOKEN,
  telegramPaymentsEnabled: false,
  telegramPaymentProviderToken: config.TELEGRAM_PAYMENT_PROVIDER_TOKEN,
  cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  cloudflareApiToken: process.env.CLOUDFLARE_API_TOKEN,
  cloudflareStreamSigningKeyId: config.CLOUDFLARE_STREAM_SIGNING_KEY_ID,
  cloudflareStreamSigningPrivateKey:
    config.CLOUDFLARE_STREAM_SIGNING_PRIVATE_KEY,
  demoCloudflareVideoUid: process.env.DEMO_CLOUDFLARE_VIDEO_UID,
  officialWatermarkText: config.OFFICIAL_WATERMARK_TEXT,
  maxConcurrentPlaySessions: 1,
};

function clean(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function cleanBoolean(value: string | null | undefined) {
  const normalized = clean(value)?.toLowerCase();

  if (!normalized) {
    return undefined;
  }

  return ['1', 'true', 'yes', 'on', 'enabled'].includes(normalized);
}

function cleanNumber(value: string | null | undefined) {
  const normalized = clean(value);

  if (!normalized) {
    return undefined;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function getRuntimeSettings(): Promise<RuntimeSettings> {
  const rows = await prisma.appSetting.findMany();
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const telegramPaymentProviderToken =
    clean(byKey.get(settingKeys.telegramPaymentProviderToken)) ||
    clean(byKey.get(settingKeys.legacyTelegramPaymentProviderToken)) ||
    clean(envFallbacks.telegramPaymentProviderToken);
  const configuredTelegramEnabled = cleanBoolean(
    byKey.get(settingKeys.telegramPaymentsEnabled),
  );

  return {
    telegramBotToken:
      clean(byKey.get(settingKeys.telegramBotToken)) ||
      clean(envFallbacks.telegramBotToken),
    telegramPaymentsEnabled:
      configuredTelegramEnabled ?? Boolean(telegramPaymentProviderToken),
    telegramPaymentProviderToken,
    cloudflareAccountId:
      clean(byKey.get(settingKeys.cloudflareAccountId)) ||
      clean(envFallbacks.cloudflareAccountId),
    cloudflareApiToken:
      clean(byKey.get(settingKeys.cloudflareApiToken)) ||
      clean(envFallbacks.cloudflareApiToken),
    cloudflareStreamSigningKeyId:
      clean(byKey.get(settingKeys.cloudflareStreamSigningKeyId)) ||
      clean(envFallbacks.cloudflareStreamSigningKeyId),
    cloudflareStreamSigningPrivateKey:
      clean(byKey.get(settingKeys.cloudflareStreamSigningPrivateKey)) ||
      clean(envFallbacks.cloudflareStreamSigningPrivateKey),
    demoCloudflareVideoUid:
      clean(byKey.get(settingKeys.demoCloudflareVideoUid)) ||
      clean(envFallbacks.demoCloudflareVideoUid),
    officialWatermarkText:
      clean(byKey.get(settingKeys.officialWatermarkText)) ||
      envFallbacks.officialWatermarkText,
    maxConcurrentPlaySessions:
      cleanNumber(byKey.get(settingKeys.maxConcurrentPlaySessions)) ??
      envFallbacks.maxConcurrentPlaySessions,
  };
}

export async function upsertSetting(key: string, value: string) {
  return prisma.appSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export function maskSecret(value: string | undefined) {
  if (!value) {
    return null;
  }

  if (value.length <= 8) {
    return '********';
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
