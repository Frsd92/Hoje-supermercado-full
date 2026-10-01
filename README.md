# Hoje Supermercado

## Organização da plataforma

- `loja/`: arquivos-fonte da loja e suas páginas legais.
- `dashboard-app/app/dashboard/`: páginas do dashboard do cliente.
- `dashboard-app/app/erp/`: rotas do ERP, mantidas separadas para preservar as URLs.
- `dashboard-app/features/erp/`: implementação exclusiva do ERP, com páginas e componentes.
- `dashboard-app/app/api/`: pontos de entrada das APIs da plataforma; a lógica exclusiva do ERP fica no módulo `features/erp`.
- `dashboard-app/public/`: arquivos estáticos preparados a partir de `loja/` pelo build; não é a pasta-fonte da loja.

O dashboard do cliente e o ERP continuam no mesmo projeto Next.js para compartilhar autenticação e APIs, mas mantêm suas próprias pastas e rotas.

## Publicação

No projeto Vercel ligado a este repositório, configure o **Root Directory** como `dashboard-app` para publicar a loja, o dashboard e o ERP no mesmo app Next.js. Configure as variáveis de autenticação indicadas em [dashboard-app/README.md](./dashboard-app/README.md) e associe o domínio `hojesupermercado.com.br` ao projeto.

## Desenvolvimento

Consulte [dashboard-app/README.md](./dashboard-app/README.md) para iniciar o projeto e executar o build.
