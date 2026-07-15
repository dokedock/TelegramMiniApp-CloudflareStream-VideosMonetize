import { importPKCS8, SignJWT } from 'jose';
import { config } from './config.js';
import { getRuntimeSettings } from './settings.js';

export async function createPlaybackUrl(cloudflareVideoUid: string) {
  const settings = await getRuntimeSettings();
  const expiresAt = new Date(Date.now() + config.TOKEN_TTL_SECONDS * 1000);

  if (
    !settings.cloudflareStreamSigningKeyId ||
    !settings.cloudflareStreamSigningPrivateKey ||
    cloudflareVideoUid === 'demo-video-uid'
  ) {
    return {
      playbackUrl: `https://iframe.videodelivery.net/${cloudflareVideoUid}`,
      tokenExpiresAt: expiresAt,
      signed: false,
    };
  }

  const privateKey = await importPKCS8(
    settings.cloudflareStreamSigningPrivateKey.replace(/\\n/g, '\n'),
    'RS256',
  );

  const token = await new SignJWT({
    sub: cloudflareVideoUid,
    downloadable: false,
  })
    .setProtectedHeader({
      alg: 'RS256',
      kid: settings.cloudflareStreamSigningKeyId,
    })
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(privateKey);

  return {
    playbackUrl: `https://iframe.videodelivery.net/${token}`,
    tokenExpiresAt: expiresAt,
    signed: true,
  };
}
