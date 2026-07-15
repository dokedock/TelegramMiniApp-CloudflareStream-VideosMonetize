import type { FastifyRequest } from 'fastify';
import { prisma } from './db.js';
import { getRuntimeSettings } from './settings.js';
import { parseAndValidateTelegramInitData } from './telegram.js';

export async function getCurrentUser(request: FastifyRequest) {
  const initData =
    request.headers['x-telegram-init-data']?.toString() ||
    request.headers.authorization?.replace(/^tma\s+/i, '');

  const settings = await getRuntimeSettings();
  const telegramUser = parseAndValidateTelegramInitData(
    initData,
    settings.telegramBotToken,
  );

  return prisma.user.upsert({
    where: {
      telegramUserId: telegramUser.telegramUserId,
    },
    update: {
      username: telegramUser.username,
      firstName: telegramUser.firstName,
      lastName: telegramUser.lastName,
      languageCode: telegramUser.languageCode,
    },
    create: telegramUser,
  });
}

export function publicUser(user: {
  id: number;
  telegramUserId: bigint;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
}) {
  return {
    id: user.id,
    telegramUserId: user.telegramUserId.toString(),
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
  };
}
