export function getPixCodeExpiry(expiresAt) {
  if (!expiresAt) return null;
  const timestamp = new Date(expiresAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function isPixCodeExpired(expiresAt, now = Date.now()) {
  const expiry = getPixCodeExpiry(expiresAt);
  return expiry !== null && expiry <= now;
}
