const supplierProposalForm = document.getElementById('supplier-proposal-form');

supplierProposalForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!supplierProposalForm.reportValidity()) return;

  const formData = new FormData(supplierProposalForm);
  const message = [
    'Olá, equipe Hoje Supermercado!',
    '',
    'Gostaria de apresentar minha empresa e uma proposta de fornecimento.',
    '',
    `Nome: ${formData.get('contactName')}`,
    `Empresa/marca: ${formData.get('companyName')}`,
    `E-mail: ${formData.get('email')}`,
    `Telefone/WhatsApp: ${formData.get('phone') || 'Não informado'}`,
    '',
    'Produtos e categorias:',
    formData.get('products'),
    '',
    'Região atendida e informações comerciais:',
    formData.get('details') || 'Não informado',
    '',
    'Posso enviar catálogo e informações adicionais, se necessário.',
  ].join('\n');
  const subject = `Proposta de fornecimento - ${formData.get('companyName')}`;
  const recipient = 'atendimento@hojesupermercado.com.br';
  const mailto = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
  const status = document.getElementById('supplier-form-status');

  status.textContent = 'Abrindo seu aplicativo de e-mail com a proposta preparada. Confira os dados, anexe seu catálogo se desejar e envie a mensagem.';
  window.location.href = mailto;
});
