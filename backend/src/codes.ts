import { randomBytes } from 'node:crypto';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeCode(length = 8) {
  const bytes = randomBytes(length);
  let code = '';

  for (const byte of bytes) {
    code += alphabet[byte % alphabet.length];
  }

  return code;
}
