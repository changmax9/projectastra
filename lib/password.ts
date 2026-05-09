import { pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";

const HASH_PREFIX = "pbkdf2";
const ITERATIONS = 120000;
const KEY_LENGTH = 64;
const DIGEST = "sha512";

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString("hex");
  return `${HASH_PREFIX}$${ITERATIONS}$${salt}$${hash}`;
}

export function isPasswordHash(value: string | undefined) {
  return Boolean(value?.startsWith(`${HASH_PREFIX}$`));
}

export function verifyPassword(password: string, stored: string | undefined) {
  if (!stored) return false;
  if (!isPasswordHash(stored)) return false;

  const [, iterationsRaw, salt, hash] = stored.split("$");
  const iterations = Number(iterationsRaw);
  if (!iterations || !salt || !hash) return false;

  const expected = Buffer.from(hash, "hex");
  const actual = pbkdf2Sync(password, salt, iterations, expected.length, DIGEST);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
