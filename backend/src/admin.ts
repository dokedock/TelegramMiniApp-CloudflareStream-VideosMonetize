import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { logActivity } from './activity.js';
import { config } from './config.js';
import { prisma } from './db.js';
import { markOrderPaidFromTelegram } from './payments.js';
import {
  getRuntimeSettings,
  maskSecret,
  settingKeys,
  upsertSetting,
} from './settings.js';

function assertAdmin(request: FastifyRequest) {
  const password = request.headers['x-admin-password']?.toString();

  if (!password || password !== config.ADMIN_PASSWORD) {
    const error = new Error('Invalid admin password');
    Object.assign(error, { statusCode: 401 });
    throw error;
  }
}

function settingStatus(value: string | undefined, revealValue = false) {
  return {
    value: revealValue ? value || '' : '',
    hasValue: Boolean(value),
    masked: maskSecret(value),
  };
}

async function telegramGetMe(botToken: string) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
  const body = (await response.json()) as {
    ok: boolean;
    result?: {
      id: number;
      username?: string;
      first_name?: string;
    };
    description?: string;
  };

  if (!response.ok || !body.ok) {
    throw new Error(body.description || 'Telegram Bot Token 测试失败');
  }

  return body.result;
}

async function cloudflareFetch<T>(path: string) {
  const settings = await getRuntimeSettings();

  if (!settings.cloudflareAccountId || !settings.cloudflareApiToken) {
    throw new Error('Cloudflare Account ID 或 API Token 未配置');
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${settings.cloudflareAccountId}${path}`,
    {
      headers: {
        authorization: `Bearer ${settings.cloudflareApiToken}`,
      },
    },
  );

  const body = (await response.json()) as {
    success: boolean;
    errors?: Array<{ message: string }>;
    result: T;
  };

  if (!response.ok || !body.success) {
    const message = body.errors?.[0]?.message || 'Cloudflare Stream 测试失败';
    throw new Error(message);
  }

  return body.result;
}

const videoBodySchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  cloudflareVideoUid: z.string().min(1),
  priceCents: z.coerce.number().int().nonnegative(),
  currency: z.string().min(1).default('USD'),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).default('ACTIVE'),
});

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const listQuerySchema = z.object({
  q: z.string().optional(),
  status: z.string().optional(),
  provider: z.string().optional(),
});

function serializeUser(user: {
  id: number;
  telegramUserId: bigint;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  languageCode: string | null;
  createdAt: Date;
}) {
  return {
    id: user.id,
    telegramUserId: user.telegramUserId.toString(),
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    languageCode: user.languageCode,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function registerAdminRoutes(app: FastifyInstance) {
  app.get('/api/admin/overview', async (request) => {
    assertAdmin(request);

    const [
      userCount,
      videoCount,
      activeVideoCount,
      orderCount,
      paidOrderCount,
      activeEntitlementCount,
      playSessionCount,
      recentOrders,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.video.count(),
      prisma.video.count({ where: { status: 'ACTIVE' } }),
      prisma.order.count(),
      prisma.order.count({ where: { status: 'PAID' } }),
      prisma.entitlement.count({ where: { status: 'ACTIVE' } }),
      prisma.playSession.count(),
      prisma.order.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: {
          user: true,
          video: true,
        },
      }),
    ]);

    return {
      stats: {
        userCount,
        videoCount,
        activeVideoCount,
        orderCount,
        paidOrderCount,
        activeEntitlementCount,
        playSessionCount,
      },
      recentOrders: recentOrders.map((order) => ({
        id: order.id,
        orderCode: order.orderCode,
        status: order.status,
        amountCents: order.amountCents,
        currency: order.currency,
        createdAt: order.createdAt.toISOString(),
        user: {
          id: order.user.id,
          telegramUserId: order.user.telegramUserId.toString(),
          username: order.user.username,
        },
        video: {
          id: order.video.id,
          title: order.video.title,
        },
      })),
    };
  });

  app.get('/api/admin/settings', async (request) => {
    assertAdmin(request);

    const settings = await getRuntimeSettings();

    return {
      settings: {
        telegramBotToken: settingStatus(settings.telegramBotToken),
        telegramPaymentsEnabled: settingStatus(
          settings.telegramPaymentsEnabled ? 'true' : 'false',
          true,
        ),
        telegramPaymentProviderToken: settingStatus(
          settings.telegramPaymentProviderToken,
        ),
        cloudflareAccountId: settingStatus(
          settings.cloudflareAccountId,
          true,
        ),
        cloudflareApiToken: settingStatus(settings.cloudflareApiToken),
        cloudflareStreamSigningKeyId: settingStatus(
          settings.cloudflareStreamSigningKeyId,
          true,
        ),
        cloudflareStreamSigningPrivateKey: settingStatus(
          settings.cloudflareStreamSigningPrivateKey,
        ),
        demoCloudflareVideoUid: settingStatus(
          settings.demoCloudflareVideoUid,
          true,
        ),
        officialWatermarkText: settingStatus(
          settings.officialWatermarkText,
          true,
        ),
        maxConcurrentPlaySessions: settingStatus(
          String(settings.maxConcurrentPlaySessions),
          true,
        ),
        mockPaymentsEnabled: settingStatus(String(config.MOCK_PAYMENTS), true),
      },
    };
  });

  app.put('/api/admin/settings', async (request) => {
    assertAdmin(request);

    const body = z
      .object({
        telegramBotToken: z.string().optional(),
        telegramPaymentsEnabled: z.string().optional(),
        telegramPaymentProviderToken: z.string().optional(),
        cloudflareAccountId: z.string().optional(),
        cloudflareApiToken: z.string().optional(),
        cloudflareStreamSigningKeyId: z.string().optional(),
        cloudflareStreamSigningPrivateKey: z.string().optional(),
        demoCloudflareVideoUid: z.string().optional(),
        officialWatermarkText: z.string().optional(),
        maxConcurrentPlaySessions: z.string().optional(),
      })
      .parse(request.body);

    const entries: Array<[string, string | undefined]> = [
      [settingKeys.telegramBotToken, body.telegramBotToken],
      [settingKeys.telegramPaymentsEnabled, body.telegramPaymentsEnabled],
      [
        settingKeys.telegramPaymentProviderToken,
        body.telegramPaymentProviderToken,
      ],
      [settingKeys.cloudflareAccountId, body.cloudflareAccountId],
      [settingKeys.cloudflareApiToken, body.cloudflareApiToken],
      [
        settingKeys.cloudflareStreamSigningKeyId,
        body.cloudflareStreamSigningKeyId,
      ],
      [
        settingKeys.cloudflareStreamSigningPrivateKey,
        body.cloudflareStreamSigningPrivateKey,
      ],
      [settingKeys.demoCloudflareVideoUid, body.demoCloudflareVideoUid],
      [settingKeys.officialWatermarkText, body.officialWatermarkText],
      [
        settingKeys.maxConcurrentPlaySessions,
        body.maxConcurrentPlaySessions,
      ],
    ];

    for (const [key, value] of entries) {
      if (typeof value === 'string' && value.trim()) {
        await upsertSetting(key, value.trim());
      }
    }

    await logActivity({
      actorType: 'admin',
      action: 'settings.update',
      entityType: 'settings',
      message: '后台配置已保存',
      request,
    });

    return { ok: true };
  });

  app.post('/api/admin/test/telegram', async (request) => {
    assertAdmin(request);

    const settings = await getRuntimeSettings();

    if (!settings.telegramBotToken) {
      throw new Error('Telegram Bot Token 未配置');
    }

    const bot = await telegramGetMe(settings.telegramBotToken);

    return {
      ok: true,
      bot,
    };
  });

  app.post('/api/admin/test/cloudflare', async (request) => {
    assertAdmin(request);

    await cloudflareFetch('/stream?per_page=1');

    return {
      ok: true,
    };
  });

  app.get('/api/admin/cloudflare/videos', async (request) => {
    assertAdmin(request);

    const videos = await cloudflareFetch<
      Array<{
        uid: string;
        thumbnail?: string;
        meta?: { name?: string };
        status?: { state?: string };
        duration?: number;
        created?: string;
      }>
    >('/stream?per_page=20');

    return {
      videos: videos.map((video) => ({
        uid: video.uid,
        name: video.meta?.name || video.uid,
        thumbnail: video.thumbnail,
        state: video.status?.state,
        duration: video.duration,
        created: video.created,
      })),
    };
  });

  app.post('/api/admin/videos/import', async (request, reply) => {
    assertAdmin(request);

    const body = z
      .object({
        cloudflareVideoUid: z.string().min(1),
        title: z.string().min(1),
        description: z.string().optional(),
        priceCents: z.coerce.number().int().nonnegative().default(990),
        currency: z.string().min(1).default('USD'),
      })
      .parse(request.body);

    const existing = await prisma.video.findFirst({
      where: {
        cloudflareVideoUid: body.cloudflareVideoUid,
      },
    });

    const video = existing
      ? await prisma.video.update({
          where: { id: existing.id },
          data: {
            title: body.title,
            description: body.description,
            priceCents: body.priceCents,
            currency: body.currency,
            status: 'ACTIVE',
          },
        })
      : await prisma.video.create({
          data: {
            title: body.title,
            description: body.description,
            cloudflareVideoUid: body.cloudflareVideoUid,
            priceCents: body.priceCents,
            currency: body.currency,
            status: 'ACTIVE',
          },
        });

    reply.code(existing ? 200 : 201);

    await logActivity({
      actorType: 'admin',
      action: existing ? 'video.import_update' : 'video.import_create',
      entityType: 'video',
      entityId: video.id,
      message: `导入视频：${video.title}`,
      metadata: { cloudflareVideoUid: video.cloudflareVideoUid },
      request,
    });

    return {
      video,
    };
  });

  app.get('/api/admin/videos', async (request) => {
    assertAdmin(request);
    const query = listQuerySchema.parse(request.query);
    const where: Prisma.VideoWhereInput = {};

    if (query.status) {
      where.status = query.status as never;
    }

    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { title: { contains: q } },
        { cloudflareVideoUid: { contains: q } },
      ];
    }

    const videos = await prisma.video.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            orders: true,
            entitlements: true,
            playSessions: true,
          },
        },
      },
    });

    return {
      videos: videos.map((video) => ({
        id: video.id,
        title: video.title,
        description: video.description,
        cloudflareVideoUid: video.cloudflareVideoUid,
        priceCents: video.priceCents,
        currency: video.currency,
        status: video.status,
        createdAt: video.createdAt.toISOString(),
        counts: video._count,
      })),
    };
  });

  app.post('/api/admin/videos', async (request, reply) => {
    assertAdmin(request);

    const body = videoBodySchema.parse(request.body);
    const video = await prisma.video.create({ data: body });

    reply.code(201);

    await logActivity({
      actorType: 'admin',
      action: 'video.create',
      entityType: 'video',
      entityId: video.id,
      message: `新建视频：${video.title}`,
      request,
    });

    return { video };
  });

  app.put('/api/admin/videos/:id', async (request) => {
    assertAdmin(request);

    const { id } = idParamSchema.parse(request.params);
    const body = videoBodySchema.partial().parse(request.body);
    const video = await prisma.video.update({
      where: { id },
      data: body,
    });

    await logActivity({
      actorType: 'admin',
      action: 'video.update',
      entityType: 'video',
      entityId: video.id,
      message: `更新视频：${video.title}`,
      metadata: body,
      request,
    });

    return { video };
  });

  app.delete('/api/admin/videos/:id', async (request) => {
    assertAdmin(request);

    const { id } = idParamSchema.parse(request.params);
    const video = await prisma.video.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });

    await logActivity({
      actorType: 'admin',
      action: 'video.archive',
      entityType: 'video',
      entityId: video.id,
      message: `归档视频：${video.title}`,
      request,
    });

    return { video };
  });

  app.get('/api/admin/orders', async (request) => {
    assertAdmin(request);
    const query = listQuerySchema.parse(request.query);
    const where: Prisma.OrderWhereInput = {};

    if (query.status) {
      where.status = query.status as never;
    }

    if (query.provider) {
      where.provider = query.provider;
    }

    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { orderCode: { contains: q } },
        { providerPaymentId: { contains: q } },
        { user: { username: { contains: q } } },
        { video: { title: { contains: q } } },
      ];
    }

    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        user: true,
        video: true,
        entitlement: true,
      },
    });

    return {
      orders: orders.map((order) => ({
        id: order.id,
        orderCode: order.orderCode,
        amountCents: order.amountCents,
        currency: order.currency,
        status: order.status,
        provider: order.provider,
        paidAt: order.paidAt?.toISOString() || null,
        createdAt: order.createdAt.toISOString(),
        user: {
          id: order.user.id,
          telegramUserId: order.user.telegramUserId.toString(),
          username: order.user.username,
          firstName: order.user.firstName,
        },
        video: {
          id: order.video.id,
          title: order.video.title,
        },
        entitlement: order.entitlement
          ? {
              id: order.entitlement.id,
              status: order.entitlement.status,
              expiresAt: order.entitlement.expiresAt?.toISOString() || null,
              revokedAt: order.entitlement.revokedAt?.toISOString() || null,
            }
          : null,
      })),
    };
  });

  app.get('/api/admin/orders/:id', async (request) => {
    assertAdmin(request);

    const { id } = idParamSchema.parse(request.params);
    const order = await prisma.order.findUniqueOrThrow({
      where: { id },
      include: {
        user: true,
        video: true,
        entitlement: true,
        playSessions: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            _count: {
              select: {
                events: true,
              },
            },
          },
        },
      },
    });

    return {
      order: {
        id: order.id,
        orderCode: order.orderCode,
        amountCents: order.amountCents,
        currency: order.currency,
        status: order.status,
        provider: order.provider,
        providerPaymentId: order.providerPaymentId,
        paidAt: order.paidAt?.toISOString() || null,
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
        user: serializeUser(order.user),
        video: {
          id: order.video.id,
          title: order.video.title,
          cloudflareVideoUid: order.video.cloudflareVideoUid,
          priceCents: order.video.priceCents,
          currency: order.video.currency,
          status: order.video.status,
        },
        entitlement: order.entitlement
          ? {
              id: order.entitlement.id,
              status: order.entitlement.status,
              startsAt: order.entitlement.startsAt.toISOString(),
              expiresAt: order.entitlement.expiresAt?.toISOString() || null,
              revokedAt: order.entitlement.revokedAt?.toISOString() || null,
              createdAt: order.entitlement.createdAt.toISOString(),
            }
          : null,
        playSessions: order.playSessions.map((session) => ({
          id: session.id,
          sessionCode: session.sessionCode,
          ipAddress: session.ipAddress,
          userAgent: session.userAgent,
          tokenExpiresAt: session.tokenExpiresAt.toISOString(),
          createdAt: session.createdAt.toISOString(),
          lastSeenAt: session.lastSeenAt?.toISOString() || null,
          eventCount: session._count.events,
        })),
      },
    };
  });

  app.post('/api/admin/orders/:id/grant', async (request) => {
    assertAdmin(request);

    const { id } = idParamSchema.parse(request.params);
    const order = await prisma.order.findUniqueOrThrow({ where: { id } });

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id },
        data: {
          status: 'PAID',
          paidAt: new Date(),
        },
      });

      await tx.entitlement.upsert({
        where: { orderId: id },
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
      actorType: 'admin',
      action: 'order.mark_paid',
      entityType: 'order',
      entityId: order.id,
      message: `标记订单已支付：${order.orderCode}`,
      request,
    });

    return { ok: true };
  });

  app.post('/api/admin/entitlements/:id/revoke', async (request) => {
    assertAdmin(request);

    const { id } = idParamSchema.parse(request.params);
    const entitlement = await prisma.entitlement.update({
      where: { id },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
      },
    });

    await logActivity({
      actorType: 'admin',
      action: 'entitlement.revoke',
      entityType: 'entitlement',
      entityId: entitlement.id,
      message: `撤销权限：${entitlement.id}`,
      metadata: { orderId: entitlement.orderId },
      request,
    });

    return { entitlement };
  });

  app.post('/api/admin/entitlements/:id/restore', async (request) => {
    assertAdmin(request);

    const { id } = idParamSchema.parse(request.params);
    const entitlement = await prisma.entitlement.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        revokedAt: null,
      },
    });

    await logActivity({
      actorType: 'admin',
      action: 'entitlement.restore',
      entityType: 'entitlement',
      entityId: entitlement.id,
      message: `恢复权限：${entitlement.id}`,
      metadata: { orderId: entitlement.orderId },
      request,
    });

    return { entitlement };
  });

  app.get('/api/admin/users', async (request) => {
    assertAdmin(request);
    const query = listQuerySchema.parse(request.query);
    const where: Prisma.UserWhereInput = {};

    if (query.q?.trim()) {
      const q = query.q.trim();
      const asBigInt = /^\d+$/.test(q) ? BigInt(q) : undefined;
      where.OR = [
        { username: { contains: q } },
        { firstName: { contains: q } },
        ...(asBigInt ? [{ telegramUserId: asBigInt }] : []),
      ];
    }

    const users = await prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        _count: {
          select: {
            orders: true,
            entitlements: true,
            playSessions: true,
          },
        },
      },
    });

    return {
      users: users.map((user) => ({
        ...serializeUser(user),
        counts: user._count,
      })),
    };
  });

  app.get('/api/admin/users/:id', async (request) => {
    assertAdmin(request);

    const { id } = idParamSchema.parse(request.params);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id },
      include: {
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            video: true,
            entitlement: true,
          },
        },
        entitlements: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            video: true,
            order: true,
          },
        },
        playSessions: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            video: true,
            order: true,
            _count: {
              select: { events: true },
            },
          },
        },
      },
    });

    return {
      user: {
        ...serializeUser(user),
        orders: user.orders.map((order) => ({
          id: order.id,
          orderCode: order.orderCode,
          status: order.status,
          provider: order.provider,
          amountCents: order.amountCents,
          currency: order.currency,
          paidAt: order.paidAt?.toISOString() || null,
          createdAt: order.createdAt.toISOString(),
          video: {
            id: order.video.id,
            title: order.video.title,
          },
          entitlement: order.entitlement
            ? {
                id: order.entitlement.id,
                status: order.entitlement.status,
              }
            : null,
        })),
        entitlements: user.entitlements.map((entitlement) => ({
          id: entitlement.id,
          status: entitlement.status,
          startsAt: entitlement.startsAt.toISOString(),
          expiresAt: entitlement.expiresAt?.toISOString() || null,
          revokedAt: entitlement.revokedAt?.toISOString() || null,
          video: {
            id: entitlement.video.id,
            title: entitlement.video.title,
          },
          order: {
            id: entitlement.order.id,
            orderCode: entitlement.order.orderCode,
          },
        })),
        playSessions: user.playSessions.map((session) => ({
          id: session.id,
          sessionCode: session.sessionCode,
          ipAddress: session.ipAddress,
          createdAt: session.createdAt.toISOString(),
          lastSeenAt: session.lastSeenAt?.toISOString() || null,
          eventCount: session._count.events,
          video: {
            id: session.video.id,
            title: session.video.title,
          },
          order: {
            id: session.order.id,
            orderCode: session.order.orderCode,
          },
        })),
      },
    };
  });

  app.get('/api/admin/play-sessions', async (request) => {
    assertAdmin(request);
    const query = listQuerySchema.parse(request.query);
    const where: Prisma.PlaySessionWhereInput = {};

    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { sessionCode: { contains: q } },
        { ipAddress: { contains: q } },
        { user: { username: { contains: q } } },
        { video: { title: { contains: q } } },
        { order: { orderCode: { contains: q } } },
      ];
    }

    const sessions = await prisma.playSession.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        user: true,
        video: true,
        order: true,
        _count: {
          select: {
            events: true,
          },
        },
      },
    });

    return {
      sessions: sessions.map((session) => ({
        id: session.id,
        sessionCode: session.sessionCode,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        tokenExpiresAt: session.tokenExpiresAt.toISOString(),
        createdAt: session.createdAt.toISOString(),
        lastSeenAt: session.lastSeenAt?.toISOString() || null,
        eventCount: session._count.events,
        user: {
          id: session.user.id,
          telegramUserId: session.user.telegramUserId.toString(),
          username: session.user.username,
        },
        video: {
          id: session.video.id,
          title: session.video.title,
        },
        order: {
          id: session.order.id,
          orderCode: session.order.orderCode,
        },
      })),
    };
  });

  app.get('/api/admin/play-sessions/:id', async (request) => {
    assertAdmin(request);

    const { id } = idParamSchema.parse(request.params);
    const session = await prisma.playSession.findUniqueOrThrow({
      where: { id },
      include: {
        user: true,
        video: true,
        order: true,
        events: {
          orderBy: { createdAt: 'desc' },
          take: 200,
        },
      },
    });

    return {
      session: {
        id: session.id,
        sessionCode: session.sessionCode,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        tokenExpiresAt: session.tokenExpiresAt.toISOString(),
        createdAt: session.createdAt.toISOString(),
        lastSeenAt: session.lastSeenAt?.toISOString() || null,
        user: {
          id: session.user.id,
          telegramUserId: session.user.telegramUserId.toString(),
          username: session.user.username,
        },
        video: {
          id: session.video.id,
          title: session.video.title,
        },
        order: {
          id: session.order.id,
          orderCode: session.order.orderCode,
        },
        events: session.events.map((event) => ({
          id: event.id,
          eventType: event.eventType,
          playbackPositionSeconds: event.playbackPositionSeconds,
          createdAt: event.createdAt.toISOString(),
        })),
      },
    };
  });

  app.get('/api/admin/play-sessions/:id/events', async (request) => {
    assertAdmin(request);

    const { id } = idParamSchema.parse(request.params);
    const events = await prisma.playEvent.findMany({
      where: { playSessionId: id },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return {
      events: events.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        playbackPositionSeconds: event.playbackPositionSeconds,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  });

  app.post('/api/admin/grants', async (request, reply) => {
    assertAdmin(request);

    const body = z
      .object({
        telegramUserId: z.coerce.bigint(),
        videoId: z.coerce.number().int().positive(),
        username: z.string().optional(),
      })
      .parse(request.body);

    const video = await prisma.video.findUniqueOrThrow({
      where: { id: body.videoId },
    });
    const orderCode = `ADM${Date.now().toString(36).toUpperCase()}`;

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { telegramUserId: body.telegramUserId },
        update: {
          username: body.username,
        },
        create: {
          telegramUserId: body.telegramUserId,
          username: body.username,
        },
      });

      const order = await tx.order.create({
        data: {
          orderCode,
          userId: user.id,
          videoId: video.id,
          amountCents: 0,
          currency: video.currency,
          status: 'PAID',
          provider: 'admin',
          paidAt: new Date(),
        },
      });

      const entitlement = await tx.entitlement.create({
        data: {
          userId: user.id,
          videoId: video.id,
          orderId: order.id,
          status: 'ACTIVE',
        },
      });

      return { user, order, entitlement };
    });

    reply.code(201);

    await logActivity({
      actorType: 'admin',
      action: 'grant.manual',
      entityType: 'order',
      entityId: result.order.id,
      message: `手动发放权限：${result.order.orderCode}`,
      metadata: {
        telegramUserId: body.telegramUserId.toString(),
        videoId: video.id,
      },
      request,
    });

    return {
      order: {
        id: result.order.id,
        orderCode: result.order.orderCode,
      },
      entitlement: result.entitlement,
    };
  });

  app.get('/api/admin/activity-logs', async (request) => {
    assertAdmin(request);
    const query = listQuerySchema.parse(request.query);
    const where: Prisma.ActivityLogWhereInput = {};

    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { action: { contains: q } },
        { entityType: { contains: q } },
        { message: { contains: q } },
        { actorId: { contains: q } },
      ];
    }

    const logs = await prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return {
      logs: logs.map((log) => ({
        id: log.id,
        actorType: log.actorType,
        actorId: log.actorId,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        message: log.message,
        metadata: log.metadata,
        ipAddress: log.ipAddress,
        createdAt: log.createdAt.toISOString(),
      })),
    };
  });

  app.post('/api/admin/dev/test-user', async (request, reply) => {
    assertAdmin(request);

    const body = z
      .object({
        telegramUserId: z.coerce.bigint().optional(),
        username: z.string().optional(),
      })
      .parse(request.body);
    const telegramUserId = body.telegramUserId || BigInt(Date.now());

    const user = await prisma.user.upsert({
      where: { telegramUserId },
      update: {
        username: body.username || `test_${telegramUserId.toString().slice(-6)}`,
      },
      create: {
        telegramUserId,
        username: body.username || `test_${telegramUserId.toString().slice(-6)}`,
        firstName: 'Test',
        lastName: 'User',
        languageCode: 'zh',
      },
    });

    await logActivity({
      actorType: 'admin',
      action: 'dev.test_user',
      entityType: 'user',
      entityId: user.id,
      message: `创建测试用户：${user.telegramUserId.toString()}`,
      request,
    });

    reply.code(201);

    return {
      user: serializeUser(user),
    };
  });

  app.post('/api/admin/dev/test-order', async (request, reply) => {
    assertAdmin(request);

    const body = z
      .object({
        telegramUserId: z.coerce.bigint(),
        videoId: z.coerce.number().int().positive(),
        provider: z.string().default('manual'),
        paid: z.coerce.boolean().default(false),
      })
      .parse(request.body);
    const video = await prisma.video.findUniqueOrThrow({
      where: { id: body.videoId },
    });

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { telegramUserId: body.telegramUserId },
        update: {},
        create: {
          telegramUserId: body.telegramUserId,
          username: `test_${body.telegramUserId.toString().slice(-6)}`,
          firstName: 'Test',
          lastName: 'Buyer',
          languageCode: 'zh',
        },
      });
      const order = await tx.order.create({
        data: {
          orderCode: `DEV${Date.now().toString(36).toUpperCase()}`,
          userId: user.id,
          videoId: video.id,
          amountCents: video.priceCents,
          currency: video.currency,
          status: body.paid ? 'PAID' : 'PENDING',
          provider: body.provider,
          paidAt: body.paid ? new Date() : null,
        },
      });
      const entitlement = body.paid
        ? await tx.entitlement.create({
            data: {
              userId: user.id,
              videoId: video.id,
              orderId: order.id,
              status: 'ACTIVE',
            },
          })
        : null;

      return { user, order, entitlement };
    });

    await logActivity({
      actorType: 'admin',
      action: 'dev.test_order',
      entityType: 'order',
      entityId: result.order.id,
      message: `创建测试订单：${result.order.orderCode}`,
      metadata: {
        paid: body.paid,
        provider: body.provider,
      },
      request,
    });

    reply.code(201);

    return {
      order: {
        id: result.order.id,
        orderCode: result.order.orderCode,
        status: result.order.status,
      },
    };
  });

  app.post('/api/admin/dev/simulate-telegram-payment', async (request) => {
    assertAdmin(request);

    const body = z
      .object({
        orderCode: z.string().min(1),
      })
      .parse(request.body);
    const order = await prisma.order.findUniqueOrThrow({
      where: { orderCode: body.orderCode },
    });

    await markOrderPaidFromTelegram(order.orderCode, {
      currency: order.currency,
      total_amount: order.amountCents,
      telegram_payment_charge_id: `dev_tg_${order.orderCode}`,
      provider_payment_charge_id: `dev_provider_${order.orderCode}`,
    });

    await logActivity({
      actorType: 'admin',
      action: 'dev.simulate_telegram_payment',
      entityType: 'order',
      entityId: order.id,
      message: `模拟 Telegram 支付回调：${order.orderCode}`,
      request,
    });

    return {
      ok: true,
      order: {
        id: order.id,
        orderCode: order.orderCode,
        status: 'PAID',
      },
    };
  });

  app.post('/api/admin/dev/clear-play-sessions', async (request) => {
    assertAdmin(request);

    const deletedEvents = await prisma.playEvent.deleteMany();
    const deletedSessions = await prisma.playSession.deleteMany();

    await logActivity({
      actorType: 'admin',
      action: 'dev.clear_play_sessions',
      entityType: 'playSession',
      message: '清理播放 session',
      metadata: {
        deletedEvents: deletedEvents.count,
        deletedSessions: deletedSessions.count,
      },
      request,
    });

    return {
      ok: true,
      deletedEvents: deletedEvents.count,
      deletedSessions: deletedSessions.count,
    };
  });
}
