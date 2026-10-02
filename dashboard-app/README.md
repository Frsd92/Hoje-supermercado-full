# Hoje-Supermercado

Aplicação Next.js que reúne o dashboard do cliente e o ERP interno.

## Organização

- `app/dashboard`: área do cliente.
- `app/erp`: rotas do ERP; a implementação fica em `features/erp`.
- `features/erp/pages`: páginas funcionais do ERP.
- `features/erp/components`: componentes compartilhados dentro do ERP.
- `app/api`: pontos de entrada das APIs; os handlers exclusivos do ERP ficam em `features/erp/api`.
- `../loja`: arquivos-fonte da loja estática. Os comandos `npm run dev` e `npm run build` copiam esses arquivos para `public`; não edite as cópias geradas manualmente.

## Acesso ao ERP

O dashboard do cliente em `/dashboard` aceita somente sessões iniciadas com Google; o ERP usa credenciais separadas do CEO. O ERP entra por `/erp` e usa a tela exclusiva `/erp/login`. Configure `ERP_CEO_USERNAME` e `ERP_CEO_PASSWORD_HASH` no `.env.local` e nas variáveis de produção do projeto que serve `www.hojesupermercado.com.br`. O nome de usuário aceita de 3 a 32 letras, números, pontos, hífens e sublinhados. No Vercel, o **Root Directory** do projeto deve ser `dashboard-app`; o domínio `www.hojesupermercado.com.br` já está associado e `NEXTAUTH_URL` aponta para ele. Gere a senha localmente, sem colocá-la no código ou enviá-la por mensagem:

```powershell
npm run erp:hash-password
```

O comando solicita a senha sem exibi-la e imprime o hash `scrypt` para salvar em `ERP_CEO_PASSWORD_HASH`. Use uma senha única entre 12 e 1024 caracteres. O acesso exige o nome de usuário configurado em `ERP_CEO_USERNAME` e a senha correspondente; o nome de usuário não diferencia maiúsculas de minúsculas. A sessão administrativa expira após 8 horas. Mantenha `NEXTAUTH_SECRET` forte e habilite HTTPS. Para proteção adicional, aplique limite de tentativas na rota de autenticação no provedor de hospedagem e ative MFA quando disponível.

Para ativar os logins em produção, adicione às variáveis **Production** do projeto Vercel `NEXTAUTH_SECRET`, `ERP_CEO_USERNAME` e `ERP_CEO_PASSWORD_HASH`. Para o login Google da loja/dashboard, configure também `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`. Não reutilize valores de desenvolvimento nem compartilhe segredos por chat. No Google Cloud, cadastre `https://www.hojesupermercado.com.br` como origem autorizada e `https://www.hojesupermercado.com.br/api/auth/callback/google` como URI de redirecionamento. Depois de salvar as variáveis, faça um novo deploy de produção.

## Desenvolvimento

Na pasta `dashboard-app`, execute `npm run dev`. O launcher reinicia o servidor Next automaticamente se uma atualização de código encerrar o processo.

Para testar a versão compilada, use `npm run start:stable`. Ela executa o build e inicia o servidor sem hot reload.

## Identidade e auditoria de produtos

O catálogo impede cadastros repetidos por nome normalizado (sem diferença de caixa, acentos ou espaços), SKU e cada código de barras. As verificações da aplicação dão uma mensagem com o produto existente; índices e códigos únicos no PostgreSQL também impedem duplicatas em gravações concorrentes. Para editar um produto, abra o cadastro existente no ERP.

Criações, edições com alterações e exclusões são registradas na tabela `ProductAuditLog`, na mesma transação que altera o catálogo. O registro conserva o responsável autenticado pelo ERP, a data/hora, o snapshot de criação/exclusão e os valores anteriores e posteriores de cada campo editado. Consulte todos os registros, filtre por produto, SKU, código, responsável, ação ou período e abra detalhes em **ERP → Auditoria de produtos** (`/erp/product-audit`); o editor também apresenta a auditoria do produto aberto. Em **ERP → Produtos** (`/erp/products`), pesquise no catálogo operacional e use **Cadastrar produto** para criar ou alterar cadastros em `/erp/products/cadastro`. Dados anteriores à implantação só podem ser mostrados quando recuperáveis do catálogo legado ou do histórico de preços já existente; snapshots recuperados são identificados como legados e não são apresentados como histórico completo.

Ao instalar esta migração em um banco existente, execute `npx prisma migrate deploy`, gere o Prisma Client (`npm run db:generate`) e execute uma vez `npm run db:backfill-product-audit` a partir de `dashboard-app`. O backfill valida colisões antes de gravar, preserva os produtos e é idempotente. Em produção, execute a migração e o backfill com o ambiente correto antes de publicar o código que exige as novas tabelas e colunas.

Em **ERP → Layout** (`/erp/layout`), o responsável pode substituir as onze artes de banner da Loja e as nove logos do carrossel “Marcas em destaque”. A tela mostra a localização, prévia e dimensões recomendadas em pixels. As imagens são salvas no PostgreSQL em `StoreLayoutAsset` e carregadas pela Loja. Ao instalar a migração `20261001004500_store_layout_banner_assets`, execute `npx prisma migrate deploy` e `npm run db:generate` a partir de `dashboard-app` antes de usar o módulo.

Os carrinhos de visitantes ficam persistidos em `GuestCart`, usando o identificador aleatório do navegador; ao entrar com Google, os itens são mesclados uma vez ao carrinho da conta e o carrinho de visitante é esvaziado. Sessões internas do ERP não são usadas como identidade de cliente pela API do carrinho. A migração `20261001010000_persist_guest_carts` cria essa persistência.
