const recipientHandoffKeys = {
  communications: 'hoje-erp-communications-recipient',
  promotions: 'hoje-erp-promotions-recipient',
};

export function storeErpRecipientHandoff(email, destination) {
  const key = recipientHandoffKeys[destination];
  if (!key) throw new Error('Destino de destinatário inválido.');
  window.sessionStorage.setItem(key, String(email).trim().toLowerCase());
}

export function consumeErpRecipientHandoff(destination) {
  const key = recipientHandoffKeys[destination];
  if (!key) throw new Error('Destino de destinatário inválido.');
  const email = window.sessionStorage.getItem(key);
  if (email !== null) window.sessionStorage.removeItem(key);
  return email?.trim().toLowerCase() || null;
}
