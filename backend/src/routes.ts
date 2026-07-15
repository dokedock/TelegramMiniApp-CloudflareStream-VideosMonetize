import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { logActivity } from './activity.js';
import { getCurrentUser, publicUser } from './auth.js';
import { makeCode } from './codes.js';
import { config, isDevelopment } from './config.js';
import { createPlaybackUrl } from './cloudflare.js';
import { prisma } from './db.js';
import {
  createTelegramInvoiceLink,
  handleTelegramPaymentUpdate,
} from './payments.js';
import { getRuntimeSettings } from './settings.js';

const idParams = z.object({
  id: z.coerce.number().int().positive(),
});

export async function registerRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({
    ok: true,
    service: 'tg-video-sales-api',
  }));

  app.post('/api/auth/telegram', async (request) => {
    const user = await getCurrentUser(request);

    return {
      user: publicUser(user),
    };
  });

  app.get('/api/videos', async (request) => {
    const user = await getCurrentUser(request);
    const videos = await prisma.video.findMany({
      where: {
        status: 'ACTIVE',
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        entitlements: {
          where: {
            userId: user.id,
            status: 'ACTIVE',
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          take: 1,
        },
      },
    });

    return {
      videos: videos.map((video) => ({
        id: video.id,
        title: video.title,
        description: video.description,
        priceCents: video.priceCents,
        currency: video.currency,
        hasAccess: video.entitlements.length > 0,
      })),
    };
  });

  app.get('/api/videos/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    const user = await getCurrentUser(request);
    const video = await prisma.video.findUniqueOrThrow({
      where: {
        id,
      },
      include: {
        entitlements: {
          where: {
            userId: user.id,
            status: 'ACTIVE',
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          include: {
            order: true,
          },
          take: 1,
        },
      },
    });

    return {
      video: {
        id: video.id,
        title: video.title,
        description: video.description,
        priceCents: video.priceCents,
        currency: video.currency,
        hasAccess: video.entitlements.length > 0,
        orderCode: video.entitlements[0]?.order.orderCode,
      },
    };
  });

  app.post('/api/orders', async (request, reply) => {
    const body = z
      .object({
        videoId: z.coerce.number().int().positive(),
        paymentMethod: z
          .enum(['mock', 'manual', 'usdt', 'stripe'])
          .default('mock'),
      })
      .parse(request.body);

    const user = await getCurrentUser(request);
    const video = await prisma.video.findFirstOrThrow({
      where: {
        id: body.videoId,
        status: 'ACTIVE',
      },
    });

    const existingEntitlement = await prisma.entitlement.findFirst({
      where: {
        userId: user.id,
        videoId: video.id,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: {
        order: true,
      },
    });

    if (existingEntitlement) {
      return {
        order: {
          orderCode: existingEntitlement.order.orderCode,
          status: existingEntitlement.order.status,
        },
      };
    }

    const orderCode = makeCode(8);
    const shouldAutoPay = config.MOCK_PAYMENTS && body.paymentMethod === 'mock';

    const order = await prisma.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
        data: {
          orderCode,
          userId: user.id,
          videoId: video.id,
          amountCents: video.priceCents,
          currency: video.currency,
          status: shouldAutoPay ? 'PAID' : 'PENDING',
          provider: body.paymentMethod,
          paidAt: shouldAutoPay ? new Date() : null,
        },
      });

      if (shouldAutoPay) {
        await tx.entitlement.create({
          data: {
            userId: user.id,
            videoId: video.id,
            orderId: createdOrder.id,
            status: 'ACTIVE',
          },
        });
      }

      return createdOrder;
    });

    await logActivity({
      actorType: 'user',
      actorId: user.telegramUserId.toString(),
      action: shouldAutoPay ? 'order.mock_paid' : 'order.create_pending',
      entityType: 'order',
      entityId: order.id,
      message: shouldAutoPay
        ? `本地模拟支付成功：${order.orderCode}`
        : `创建待支付订单：${order.orderCode}`,
      metadata: {
        provider: body.paymentMethod,
        videoId: video.id,
      },
      request,
    });

    reply.code(201);

    return {
      order: {
        orderCode: order.orderCode,
        status: order.status,
      },
    };
  });

  app.post('/api/payments/telegram/invoice', async (request, reply) => {
    const body = z
      .object({
        videoId: z.coerce.number().int().positive(),
      })
      .parse(request.body);

    const user = await getCurrentUser(request);
    const video = await prisma.video.findFirstOrThrow({
      where: {
        id: body.videoId,
        status: 'ACTIVE',
      },
    });

    const existingEntitlement = await prisma.entitlement.findFirst({
      where: {
        userId: user.id,
        videoId: video.id,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: {
        order: true,
      },
    });

    if (existingEntitlement) {
      return {
        alreadyPaid: true,
        order: {
          orderCode: existingEntitlement.order.orderCode,
          status: existingEntitlement.order.status,
        },
      };
    }

    const existingPendingOrder = await prisma.order.findFirst({
      where: {
        userId: user.id,
        videoId: video.id,
        status: 'PENDING',
        provider: 'telegram',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const order =
      existingPendingOrder ||
      (await prisma.order.create({
        data: {
          orderCode: makeCode(8),
          userId: user.id,
          videoId: video.id,
          amountCents: video.priceCents,
          currency: video.currency,
          status: 'PENDING',
          provider: 'telegram',
        },
      }));

    const invoiceLink = await createTelegramInvoiceLink(order.id);

    reply.code(existingPendingOrder ? 200 : 201);

    return {
      alreadyPaid: false,
      invoiceLink,
      order: {
        orderCode: order.orderCode,
        status: order.status,
      },
    };
  });

  app.post('/api/telegram/webhook', async (request) => {
    return handleTelegramPaymentUpdate(request.body as never);
  });

  app.post('/api/orders/:orderCode/mark-paid', async (request) => {
    if (!isDevelopment) {
      throw new Error('This endpoint is only available in development');
    }

    const { orderCode } = z
      .object({
        orderCode: z.string().min(1),
      })
      .parse(request.params);

    const order = await prisma.order.findUniqueOrThrow({
      where: {
        orderCode,
      },
    });

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: {
          id: order.id,
        },
        data: {
          status: 'PAID',
          paidAt: new Date(),
        },
      });

      await tx.entitlement.upsert({
        where: {
          orderId: order.id,
        },
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

    return {
      ok: true,
    };
  });

  app.post('/api/videos/:id/play', async (request) => {
    const { id } = idParams.parse(request.params);
    const user = await getCurrentUser(request);
    const entitlement = await prisma.entitlement.findFirst({
      where: {
        userId: user.id,
        videoId: id,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: {
        video: true,
        order: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!entitlement) {
      const error = new Error('No active entitlement for this video');
      Object.assign(error, { statusCode: 403 });
      throw error;
    }

    const runtimeSettings = await getRuntimeSettings();
    const maxConcurrent = runtimeSettings.maxConcurrentPlaySessions;

    if (maxConcurrent > 0) {
      const activeSince = new Date(Date.now() - 45_000);
      const activeSessionCount = await prisma.playSession.count({
        where: {
          userId: user.id,
          tokenExpiresAt: { gt: new Date() },
          OR: [
            { lastSeenAt: { gt: activeSince } },
            { lastSeenAt: null, createdAt: { gt: activeSince } },
          ],
        },
      });

      if (activeSessionCount >= maxConcurrent) {
        const error = new Error('当前账号已有播放会话，请关闭其他播放窗口后再试');
        Object.assign(error, { statusCode: 429 });
        throw error;
      }
    }

    const playback = await createPlaybackUrl(entitlement.video.cloudflareVideoUid);
    const sessionCode = makeCode(10);

    const playSession = await prisma.playSession.create({
      data: {
        sessionCode,
        userId: user.id,
        videoId: entitlement.videoId,
        orderId: entitlement.orderId,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent']?.toString(),
        tokenExpiresAt: playback.tokenExpiresAt,
      },
    });

    await logActivity({
      actorType: 'user',
      actorId: user.telegramUserId.toString(),
      action: 'play_session.start',
      entityType: 'playSession',
      entityId: playSession.id,
      message: `开始播放：${entitlement.video.title}`,
      metadata: {
        orderCode: entitlement.order.orderCode,
        videoId: entitlement.videoId,
      },
      request,
    });

    return {
      playbackUrl: playback.playbackUrl,
      signed: playback.signed,
      tokenExpiresAt: playback.tokenExpiresAt.toISOString(),
      sessionCode,
      watermarks: {
        orderCode: entitlement.order.orderCode,
        official: runtimeSettings.officialWatermarkText,
      },
    };
  });

  app.post('/api/play-sessions/:sessionCode/events', async (request) => {
    const { sessionCode } = z
      .object({
        sessionCode: z.string().min(1),
      })
      .parse(request.params);

    const body = z
      .object({
        eventType: z.enum(['play', 'pause', 'seek', 'heartbeat', 'ended']),
        playbackPositionSeconds: z.number().int().nonnegative().optional(),
      })
      .parse(request.body);

    const playSession = await prisma.playSession.findUniqueOrThrow({
      where: {
        sessionCode,
      },
    });

    await prisma.playEvent.create({
      data: {
        playSessionId: playSession.id,
        eventType: body.eventType,
        playbackPositionSeconds: body.playbackPositionSeconds,
      },
    });

    await prisma.playSession
      .update({
        where: {
          id: playSession.id,
        },
        data: {
          lastSeenAt: new Date(),
        },
      })
      .catch(() => undefined);

    return {
      ok: true,
    };
  });
}
