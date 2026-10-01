export function hasErpAccess(user) {
  const ceoUsername = process.env.ERP_CEO_USERNAME?.trim().toLowerCase();
  const username = typeof user?.username === 'string' ? user.username.trim().toLowerCase() : '';
  const sessionIsCurrent = typeof user?.erpAccessExpiresAt === 'number' && user.erpAccessExpiresAt > Date.now();

  return Boolean(ceoUsername && user?.erpAccess === true && sessionIsCurrent && username === ceoUsername);
}

export function erpActorLabel(user) {
  return user?.username || user?.email || 'CEO';
}
