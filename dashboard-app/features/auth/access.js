export function hasCustomerDashboardAccess(token) {
  return token?.authProvider === 'google' && token.erpAccess !== true;
}
