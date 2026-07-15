import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
  const cloudflareVideoUid =
    process.env.DEMO_CLOUDFLARE_VIDEO_UID || 'demo-video-uid';

  await prisma.video.upsert({
    where: { id: 1 },
    update: {
      cloudflareVideoUid,
      status: 'ACTIVE',
    },
    create: {
      title: '示例私密视频',
      description: '用于本地开发和播放器水印调试。',
      cloudflareVideoUid,
      priceCents: 990,
      currency: 'USD',
      status: 'ACTIVE',
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
