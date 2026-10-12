export function getAuditDevice(userAgent = '') {
  const agent = String(userAgent).slice(0, 512);
  const deviceType = /ipad|tablet|kindle|silk/i.test(agent)
    ? 'Tablet'
    : /mobile|iphone|ipod|android/i.test(agent)
      ? 'Celular'
      : agent
        ? 'Computador'
        : 'Desconhecido';
  const browser = /edg(?:e|ios|a)?\/([\d.]+)/i.test(agent)
    ? 'Edge'
    : /opr\/([\d.]+)/i.test(agent)
      ? 'Opera'
      : /(?:chrome|crios)\/([\d.]+)/i.test(agent)
        ? 'Chrome'
        : /firefox\/([\d.]+)/i.test(agent)
          ? 'Firefox'
          : /safari\/([\d.]+)/i.test(agent)
            ? 'Safari'
            : 'Desconhecido';
  const operatingSystem = /windows/i.test(agent)
    ? 'Windows'
    : /android/i.test(agent)
      ? 'Android'
      : /iphone|ipad|ipod/i.test(agent)
        ? 'iOS'
        : /mac os|macintosh/i.test(agent)
          ? 'macOS'
          : /linux/i.test(agent)
            ? 'Linux'
            : 'Desconhecido';

  return { deviceType, browser, operatingSystem };
}

export function classifyAuditAction(method, pathname) {
  const normalizedMethod = String(method || 'GET').toUpperCase();
  if (pathname === '/login' || pathname === '/erp/login' || pathname.startsWith('/api/auth/')) return 'AUTH';
  if (normalizedMethod === 'GET' || normalizedMethod === 'HEAD') {
    return pathname.startsWith('/api/') ? 'DATA_READ' : 'PAGE_VIEW';
  }
  if (normalizedMethod === 'POST') return 'COMMAND';
  if (normalizedMethod === 'PUT' || normalizedMethod === 'PATCH') return 'UPDATE';
  if (normalizedMethod === 'DELETE') return 'DELETE';
  return 'REQUEST';
}

export function sanitizeAuditRoute(pathname) {
  return String(pathname || '/')
    .slice(0, 300)
    .replace(/[^/]*(?:%40|@)[^/]*/gi, '[redacted]')
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[document]');
}

export function auditEventLabel(event) {
  const method = String(event.method || '').toUpperCase();
  if (event.source === 'DATABASE') {
    return ({ CREATE: 'Registro criado', UPDATE: 'Registro alterado', DELETE: 'Registro excluído' })[event.action] || event.action;
  }
  const actionLabels = {
    PAGE_VIEW: 'Visualização de página',
    DATA_READ: 'Consulta de dados',
    COMMAND: 'Ação solicitada',
    UPDATE: 'Alteração solicitada',
    DELETE: 'Exclusão solicitada',
    AUTH: 'Acesso/autenticação',
    REQUEST: 'Requisição',
  };
  return actionLabels[event.action] || event.action || method;
}
