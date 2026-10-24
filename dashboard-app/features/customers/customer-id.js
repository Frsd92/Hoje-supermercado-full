export function formatCustomerId(value) {
  const customerId = String(value || '').trim();
  return customerId ? `CLI-${customerId.toUpperCase()}` : '';
}

export function maskCpf(value) {
  const cpf = String(value || '').replace(/\D/g, '');
  if (!cpf) return '';
  return cpf.length === 11 ? `***.***.***-${cpf.slice(-2)}` : 'CPF cadastrado';
}
