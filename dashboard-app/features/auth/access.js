export function hasCustomerDashboardAccess(token) {
  return token?.authProvider === 'google'
    && token.erpAccess !== true
    && typeof token.email === 'string'
    && Boolean(token.email.trim());
}
