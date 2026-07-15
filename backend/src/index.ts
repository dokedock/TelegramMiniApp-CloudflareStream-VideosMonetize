import cors from '@fastify/cors';
import fastify from 'fastify';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { registerAdminRoutes } from './admin.js';
import { config } from './config.js';
import { registerRoutes } from './routes.js';

const app = fastify({
  logger: true,
});

await app.register(cors, {
  origin: config.FRONTEND_ORIGIN,
});

await registerRoutes(app);
await registerAdminRoutes(app);

app.setErrorHandler((
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  request.log.error(error);

  const statusCode =
    error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;

  reply.status(statusCode).send({
    error: statusCode === 500 ? 'Internal Server Error' : error.message,
  });
});

await app.listen({
  port: config.PORT,
  host: config.HOST,
});
