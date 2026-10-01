import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const saltLength = 16;
const keyLength = 64;

export async function createErpPasswordHash(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 1024) {
    throw new Error('A senha do ERP deve ter entre 12 e 1024 caracteres.');
  }

  const salt = randomBytes(saltLength);
  const key = await scrypt(password, salt, keyLength);
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyErpPassword(password, passwordHash) {
  if (typeof password !== 'string' || password.length > 1024 || typeof passwordHash !== 'string') return false;

  const [algorithm, encodedSalt, encodedKey, ...extraParts] = passwordHash.split('$');
  if (algorithm !== 'scrypt' || !encodedSalt || !encodedKey || extraParts.length > 0) return false;

  const salt = Buffer.from(encodedSalt, 'base64url');
  const expectedKey = Buffer.from(encodedKey, 'base64url');
  if (salt.length !== saltLength || expectedKey.length !== keyLength) return false;

  const actualKey = await scrypt(password, salt, keyLength);
  return timingSafeEqual(actualKey, expectedKey);
}

export async function verifyErpCredentials(username, password, config = process.env) {
  const ceoUsername = normalizeErpUsername(config.ERP_CEO_USERNAME);
  const submittedUsername = normalizeErpUsername(username);
  const usernameMatches = Boolean(ceoUsername && submittedUsername === ceoUsername);
  const passwordMatches = await verifyErpPassword(password, config.ERP_CEO_PASSWORD_HASH);
  return usernameMatches && passwordMatches;
}

export function normalizeErpUsername(username) {
  if (typeof username !== 'string') return '';
  const normalized = username.trim().toLowerCase();
  return /^[a-z0-9._-]{3,32}$/.test(normalized) ? normalized : '';
}
