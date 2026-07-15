import { prisma } from './db.js';
import { logActivity } from './activity.js';
import { getRuntimeSettings } from './settings.js';

type TelegramApiResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

type TelegramUpdate = {
  update_id: number;
  pre_checkout_query?: {
    id: string;
    invoice_payload: string;
    currency: string;
    total_amount: number;
  };
  message?: {
    successful_payment?: {
      currency: string;
      total_amount: number;
      invoice_payload: string;
      telegram_payment_charge_id: string;
      provider_payment_charge_id: string;
    };
  };
};

async function telegramApi<T>(
  method: string,
  body: Record<string, unknown>,
  botToken?: string,
) {
  const settings = await getRuntimeSettings();
  const token = botToken || settings.telegramBotToken;

  if (!token) {
    throw new Error('Telegram Bot Token 未配置');
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as TelegramApiResponse<T>;

  if (!response.ok || !payload.ok) {
    throw new Error(payload.description || `Telegram API ${method} failed`);
  }

  return payload.result as T;
}

export function paymentPayload(orderCode: string) {
  return `order:${orderCode}`;
}

function orderCodeFromPayload(payload: string) {
  if (!payload.startsWith('order:')) {
    return null;
  }

  return payload.slice('order:'.length);
}

export async function createTelegramInvoiceLink(orderId: number) {
  const settings = await getRuntimeSettings();

  if (!settings.telegramPaymentsEnabled) {
    throw new Error('Telegram Payments 未启用');
  }

  if (!settings.telegramPaymentProviderToken) {
    throw new Error('Telegram Payment Provider Token 未配置');
  }

  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      video: true,
    },
  });

  return telegramApi<string>('createInvoiceLink', {
    title: order.video.title,
    description: order.video.description || order.video.title,
    payload: paymentPayload(order.orderCode),
    provider_token: settings.telegramPaymentProviderToken,
    currency: order.currency,
    prices: [
      {
        label: order.video.title,
        amount: order.amountCents,
      },
    ],
  });
}

export async function answerPreCheckoutQuery(
  queryId: string,
  ok: boolean,
  errorMessage?: string,
) {
  return telegramApi<boolean>('answerPreCheckoutQuery', {
    pre_checkout_query_id: queryId,
    ok,
    error_message: errorMessage,
  });
}

async function markOrderPaidFromTelegram(
  orderCode: string,
  payment: {
    currency: string;
    total_amount: number;
    telegram_payment_charge_id: string;
    provider_payment_charge_id: string;
  },
) {
  const order = await prisma.order.findUniqueOrThrow({
    where: { orderCode },
  });

  if (
    order.currency !== payment.currency ||
    order.amountCents !== payment.total_amount
  ) {
    throw new Error('Telegram payment amount does not match order');
  }

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: 'PAID',
        provider: 'telegram',
        providerPaymentId:
          payment.provider_payment_charge_id ||
          payment.telegram_payment_charge_id,
        paidAt: new Date(),
      },
    });

    await tx.entitlement.upsert({
      where: { orderId: order.id },
      update: {
        status: 'ACTIVE',
        revokedAt: null,
      },
      create: {
        userId: order.userId,
        videoId: order.videoId,
        orderId: order.id,
        status: 'ACTIVE',
      },
    });
  });

  await logActivity({
    actorType: 'system',
    action: 'payment.telegram_paid',
    entityType: 'order',
    entityId: order.id,
    message: `Telegram 支付成功：${order.orderCode}`,
    metadata: {
      providerPaymentId:
        payment.provider_payment_charge_id ||
        payment.telegram_payment_charge_id,
    },
  });
}

export async function handleTelegramPaymentUpdate(update: TelegramUpdate) {
  const preCheckout = update.pre_checkout_query;

  if (preCheckout) {
    const orderCode = orderCodeFromPayload(preCheckout.invoice_payload);

    if (!orderCode) {
      await answerPreCheckoutQuery(preCheckout.id, false, '订单无效');
      return { ok: true, handled: 'pre_checkout_rejected' };
    }

    const order = await prisma.order.findUnique({
      where: { orderCode },
    });

    if (
      !order ||
      order.status === 'PAID' ||
      order.currency !== preCheckout.currency ||
      order.amountCents !== preCheckout.total_amount
    ) {
      await answerPreCheckoutQuery(preCheckout.id, false, '订单状态或金额不匹配');
      return { ok: true, handled: 'pre_checkout_rejected' };
    }

    await answerPreCheckoutQuery(preCheckout.id, true);
    return { ok: true, handled: 'pre_checkout_approved' };
  }

  const successfulPayment = update.message?.successful_payment;

  if (successfulPayment) {
    const orderCode = orderCodeFromPayload(successfulPayment.invoice_payload);

    if (orderCode) {
      await markOrderPaidFromTelegram(orderCode, successfulPayment);
    }

    return { ok: true, handled: 'successful_payment' };
  }

  return { ok: true, handled: 'ignored' };
}
