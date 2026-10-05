const customerAuthProviders = new Set(['google', 'apple']);

export function hasCustomerDashboardAccess(token) {
  return customerAuthProviders.has(token?.authProvider)
    && token.erpAccess !== true
    && typeof token.email === 'string'
    && Boolean(token.email.trim());
}
