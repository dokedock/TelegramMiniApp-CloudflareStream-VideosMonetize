import type { FastifyRequest } from 'fastify';
import { prisma } from './db.js';

type ActivityInput = {
  actorType: 'admin' | 'user' | 'system';
  actorId?: string;
  action: string;
  entityType: string;
  entityId?: number;
  message: string;
  metadata?: Record<string, unknown>;
  request?: FastifyRequest;
};

export async function logActivity(input: ActivityInput) {
  await prisma.activityLog
    .create({
      data: {
        actorType: input.actorType,
        actorId: input.actorId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        message: input.message,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        ipAddress: input.request?.ip,
        userAgent: input.request?.headers['user-agent']?.toString(),
      },
    })
    .catch(() => undefined);
}
