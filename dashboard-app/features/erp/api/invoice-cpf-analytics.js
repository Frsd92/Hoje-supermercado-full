const genderLabels = new Map([
  ['masculino', 'Masculino'],
  ['homem', 'Masculino'],
  ['feminino', 'Feminino'],
  ['mulher', 'Feminino'],
]);

function customerGender(profile) {
  return genderLabels.get(String(profile?.gender || '').trim().toLowerCase()) || 'Não informado';
}

export function buildInvoiceCpfAnalytics(orders, profiles) {
  const profilesByEmail = new Map(
    profiles.map((profile) => [String(profile.email || '').trim().toLowerCase(), profile]),
  );
  const customersByKey = new Map();
  let totalOrders = 0;

  orders.forEach((order, index) => {
    if (order.status === 'Cancelado' || order.includeCpfOnReceipt !== true) return;

    totalOrders += 1;
    const email = String(order.customerEmail || '').trim();
    const normalizedEmail = email.toLowerCase();
    const key = normalizedEmail.includes('@') ? normalizedEmail : `order:${order.id || index}`;
    const profile = profilesByEmail.get(normalizedEmail);
    let customer = customersByKey.get(key);
    if (!customer) {
      customer = {
        key,
        name: profile?.fullName || order.customerName || email || 'Cliente não identificado',
        email,
        gender: customerGender(profile),
        requests: 0,
      };
      customersByKey.set(key, customer);
    }
    customer.requests += 1;
  });

  const genderGroups = new Map([
    ['Masculino', { label: 'Masculino', customers: 0, orders: 0 }],
    ['Feminino', { label: 'Feminino', customers: 0, orders: 0 }],
    ['Não informado', { label: 'Não informado', customers: 0, orders: 0 }],
  ]);
  const customers = [...customersByKey.values()];
  customers.forEach((customer) => {
    const group = genderGroups.get(customer.gender);
    group.customers += 1;
    group.orders += customer.requests;
  });

  return {
    totalOrders,
    totalCustomers: customers.length,
    gender: [...genderGroups.values()],
    requesters: customers.sort((first, second) => second.requests - first.requests || first.name.localeCompare(second.name, 'pt-BR')),
  };
}
