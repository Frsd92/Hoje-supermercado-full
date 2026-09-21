export const orderStatus = {
  Recebido: { label: 'Recebido', tone: 'received', color: '#B3E5FC' },
  Separacao: { label: 'Em separação', tone: 'separating', color: '#FFE082' },
  Expedicao: { label: 'Em expedição', tone: 'shipping', color: '#FF9800' },
  'Em transito': { label: 'Em trânsito', tone: 'transit', color: '#1E88E5' },
  Concluido: { label: 'Entrega concluída', tone: 'completed', color: '#4CAF50' },
  Cancelado: { label: 'Cancelado', tone: 'cancelled', color: '#B0BEC5' },
};

export const orderStages = ['Recebido', 'Separacao', 'Expedicao', 'Em transito', 'Concluido'];

export function getOrderStatus(status) {
  return orderStatus[status] || { label: status || 'Status não informado', tone: 'unknown', color: '#B0BEC5' };
}
