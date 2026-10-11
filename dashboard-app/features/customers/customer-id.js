export function formatCustomerId(value) {
  const customerId = String(value || '').trim();
  return customerId ? `CLI-${customerId.toUpperCase()}` : '';
}
