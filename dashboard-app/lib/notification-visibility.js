export function isNotificationVisibleToCustomer(notification, customerEmail, now = Date.now()) {
  if (!notification || typeof notification !== 'object') return false;

  const expiration = Date.parse(notification.expiresAt);
  if (!Number.isFinite(expiration) || expiration <= now) return false;

  if (notification.audience === 'all') return true;
  if (notification.audience !== 'selected' || !Array.isArray(notification.recipients)) return false;

  const normalizedEmail = String(customerEmail || '').trim().toLowerCase();
  return normalizedEmail.length > 0
    && notification.recipients.some((recipient) => String(recipient).trim().toLowerCase() === normalizedEmail);
}
