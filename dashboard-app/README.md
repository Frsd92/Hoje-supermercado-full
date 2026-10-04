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

## Monitoramento de validade

Em **ERP → Validade** (`/erp/validade`), cada linha representa um lote e seu próprio saldo, validade, fabricação e localização. O estoque agregado do produto é a soma dos saldos dos lotes. O cadastro do produto salva os dados do catálogo e, após salvar um novo produto, abre o registro do lote inicial; entradas futuras podem ser iniciadas pela ação **Registrar lote** no menu lateral ou pelo recebimento de uma ordem de compra. O prazo padrão do produto é apenas uma sugestão: quantidade, código, fabricação e validade real são informados por lote, podendo calcular a data pela fabricação e prazo em dias ou digitar a data do rótulo. Ajustes manuais alteram um lote específico. A tela sinaliza vencidos e as faixas de até 1, 3, 5, 10, 15, 30 e 45 dias, além de lotes sem data e produtos sem controle de validade. Ao iniciar a separação de um pedido, o estoque é baixado automaticamente por FEFO (vence primeiro, sai primeiro); lotes vencidos não são usados e a separação é bloqueada quando o saldo válido for insuficiente.

Para instalar o controle por lote em um banco existente, aplique a migração `20261002210000_product_inventory_lots` com `npx prisma migrate deploy` e gere o Prisma Client com `npm run db:generate`, a partir de `dashboard-app`. A migração preserva o saldo legado em um lote inicial por produto, sem inventar datas de validade. Em produção, execute a migração com o ambiente correto antes de publicar o código que exige as novas tabelas. O backfill independente de auditoria de produtos (`npm run db:backfill-product-audit`) continua necessário apenas quando houver dados legados a recuperar para esse histórico.

## Pedidos e Analytics

Pedidos e itens são persistidos no PostgreSQL; a finalização também registra o endereço de entrega, a forma de pagamento, o consentimento para CPF na nota, o cupom e o custo do produto no momento da venda. As quantidades de `OrderItem` aceitam frações para produtos vendidos por peso. O ERP, o histórico do cliente, a contagem de vendas do catálogo e o Analytics consultam essas mesmas tabelas. Estoque e validade são calculados pelos lotes; perfis e endereços são lidos de `CustomerProfile` e `CustomerAddressBook`, com os endereços exibidos no Analytics somente em forma agregada.

Antes de publicar essa estrutura em um banco existente, execute `npx prisma migrate deploy` e `npm run db:generate` em `dashboard-app`. Se houver um backup legado em `data/orders.json`, `npm run db:seed-json` importa pedidos ausentes e informa arquivos não encontrados; sem esse backup, o sistema não inventa nem reconstrói vendas históricas. O Analytics sinaliza quando ainda não há pedidos ou quando o custo histórico não permite calcular lucro e margem com segurança.

Em **ERP → Layout** (`/erp/layout`), o responsável pode substituir as onze artes de banner da Loja e as nove logos do carrossel “Marcas em destaque”. A tela mostra a localização, prévia e dimensões recomendadas em pixels. As imagens são salvas no PostgreSQL em `StoreLayoutAsset` e carregadas pela Loja. Ao instalar a migração `20261001004500_store_layout_banner_assets`, execute `npx prisma migrate deploy` e `npm run db:generate` a partir de `dashboard-app` antes de usar o módulo.

Os carrinhos de visitantes ficam persistidos em `GuestCart`, usando o identificador aleatório do navegador; ao entrar com Google, os itens são mesclados uma vez ao carrinho da conta e a data preserva a atividade mais recente dos carrinhos de origem, sem considerar o login como uma nova alteração de produtos. O Analytics do ERP inclui carrinhos não vazios de clientes e visitantes sem atividade por pelo menos 24 horas. Em contas identificadas, a equipe pode zerar o carrinho com confirmação ou iniciar um comunicado/cupom direcionado ao cliente; carrinhos anônimos mostram os produtos e permitem zerar o carrinho, mas não podem receber comunicação/cupom direcionado sem dados de contato. O identificador original dos visitantes não é exibido. Sessões internas do ERP não são usadas como identidade de cliente pela API do carrinho. A migração `20261001010000_persist_guest_carts` cria essa persistência.
