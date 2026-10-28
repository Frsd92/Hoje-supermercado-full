import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { erpActorLabel, hasErpAccess } from '@/features/erp/access';
import { getNextSubscriptionDueDate, getSubscriptionPeriod, subscriptionBillingCycles } from '@/features/erp/api/company-subscriptions';
import { prisma } from '@/lib/prisma';

const headers = { 'Cache-Control': 'private, no-store, max-age=0' };

function dateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : undefined;
}

function parseAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 && value <= 999999999999.99 ? value : null;
  if (typeof value !== 'string' || !/^\d{1,12}(?:[.,]\d{1,2})?$/.test(value.trim())) return null;
  const amount = Number(value.replace(',', '.'));
  return Number.isFinite(amount) && amount > 0 && amount <= 999999999999.99 ? amount : null;
}

function readSubscription(body) {
  const name = String(body.name || '').trim();
  const provider = String(body.provider || '').trim();
  const plan = String(body.plan || '').trim() || null;
  const accountEmail = String(body.accountEmail || '').trim() || null;
  const managementUrl = String(body.managementUrl || '').trim() || null;
  const paymentMethod = String(body.paymentMethod || '').trim() || null;
  const billingCycle = String(body.billingCycle || '');
  const amount = parseAmount(body.amount);
  const nextDueAt = dateOnly(body.nextDueAt);
  const categoryId = String(body.categoryId || '').trim();
  const notes = String(body.notes || '').trim() || null;

  if (!name || name.length > 100 || !provider || provider.length > 80
    || (plan && plan.length > 100) || (accountEmail && (accountEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountEmail)))
    || (managementUrl && managementUrl.length > 500) || (paymentMethod && paymentMethod.length > 80)
    || !subscriptionBillingCycles.has(billingCycle) || amount === null || nextDueAt === undefined
    || !categoryId || typeof body.autoRenew !== 'boolean' || (notes && notes.length > 1000)) {
    return null;
  }
  if (managementUrl) {
    try {
      const url = new URL(managementUrl);
      if (!['http:', 'https:'].includes(url.protocol)) return null;
    } catch {
      return null;
    }
  }

  const description = `${provider}: ${name}`;
  if (description.length > 180) return null;
  return {
    name,
    provider,
    plan,
    accountEmail,
    managementUrl,
    paymentMethod,
    billingCycle,
    amount,
    nextDueAt,
    categoryId,
    autoRenew: body.autoRenew,
    notes,
  };
}

async function getValidExpenseCategory(transaction, categoryId) {
  const category = await transaction.financialChartAccount.findFirst({
    where: { id: categoryId, nature: 'EXPENSE', active: true },
    select: { id: true, code: true },
  });
  if (!category) return null;
  const child = await transaction.financialChartAccount.findFirst({
    where: { active: true, code: { startsWith: `${category.code}.` } },
    select: { id: true },
  });
  return child ? null : category;
}

async function addSubscriptionExpense(transaction, subscription, actor) {
  const period = getSubscriptionPeriod(subscription.nextDueAt, subscription.billingCycle);
  const existing = await transaction.companyExpense.findUnique({
    where: {
      serviceSubscriptionId_subscriptionPeriod: {
        serviceSubscriptionId: subscription.id,
        subscriptionPeriod: period,
      },
    },
  });
  if (existing) {
    if (existing.status === 'Cancelada') {
      const restored = await transaction.companyExpense.update({
        where: { id: existing.id },
        data: {
          description: `${subscription.provider}: ${subscription.name}`,
          amount: subscription.amount,
          competenceAt: subscription.nextDueAt,
          dueAt: subscription.nextDueAt,
          status: 'Em aberto',
          paidAt: null,
          notes: subscription.notes,
          categoryId: subscription.categoryId,
        },
      });
      await transaction.companyExpenseAuditLog.create({
        data: {
          expenseId: restored.id,
          action: 'REOPENED',
          actor,
          snapshot: { status: restored.status, dueAt: restored.dueAt?.toISOString() || null },
        },
      });
    }
    return existing;
  }

  const expense = await transaction.companyExpense.create({
    data: {
      description: `${subscription.provider}: ${subscription.name}`,
      amount: subscription.amount,
      competenceAt: subscription.nextDueAt,
      dueAt: subscription.nextDueAt,
      notes: subscription.notes,
      createdBy: actor,
      categoryId: subscription.categoryId,
      serviceSubscriptionId: subscription.id,
      subscriptionPeriod: period,
    },
  });
  await transaction.companyExpenseAuditLog.create({
    data: {
      expenseId: expense.id,
      action: 'CREATED',
      actor,
      snapshot: {
        description: expense.description,
        amount: expense.amount.toString(),
        competenceAt: expense.competenceAt.toISOString(),
        dueAt: expense.dueAt?.toISOString() || null,
        status: expense.status,
        categoryId: expense.categoryId,
        serviceSubscriptionId: subscription.id,
      },
    },
  });
  return expense;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers });

  try {
    const subscriptions = await prisma.companyServiceSubscription.findMany({
      include: { category: { select: { id: true, code: true, name: true } } },
      orderBy: [{ active: 'desc' }, { nextDueAt: 'asc' }, { provider: 'asc' }],
    });
    return Response.json({ subscriptions }, { headers });
  } catch (error) {
    console.error('Não foi possível carregar contas e serviços do financeiro:', error);
    return Response.json({ error: 'Não foi possível carregar contas e serviços agora.' }, { status: 503, headers });
  }
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers });
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Os dados enviados são inválidos.' }, { status: 400, headers });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json({ error: 'Os dados enviados são inválidos.' }, { status: 400, headers });
  }

  const subscriptionData = readSubscription(body);
  if (!subscriptionData) return Response.json({ error: 'Confira os dados da conta, o valor, o vencimento e a frequência.' }, { status: 400, headers });
  const actor = erpActorLabel(session.user);

  try {
    const subscription = await prisma.$transaction(async (transaction) => {
      const category = await getValidExpenseCategory(transaction, subscriptionData.categoryId);
      if (!category) throw new RangeError('Selecione uma conta analítica ativa do plano de despesas.');
      const created = await transaction.companyServiceSubscription.create({
        data: { ...subscriptionData, createdBy: actor },
      });
      await transaction.companyServiceSubscriptionAuditLog.create({
        data: {
          subscriptionId: created.id,
          action: 'CREATED',
          actor,
          snapshot: {
            name: created.name,
            provider: created.provider,
            amount: created.amount.toString(),
            nextDueAt: created.nextDueAt.toISOString(),
            billingCycle: created.billingCycle,
            categoryId: created.categoryId,
          },
        },
      });
      await addSubscriptionExpense(transaction, created, actor);
      return transaction.companyServiceSubscription.findUnique({
        where: { id: created.id },
        include: { category: { select: { id: true, code: true, name: true } } },
      });
    });
    return Response.json({ subscription }, { status: 201, headers });
  } catch (error) {
    if (error instanceof RangeError) return Response.json({ error: error.message }, { status: 400, headers });
    console.error('Não foi possível cadastrar conta ou serviço:', error);
    return Response.json({ error: 'Não foi possível cadastrar a conta ou serviço.' }, { status: 503, headers });
  }
}

export async function PATCH(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers });
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Os dados enviados são inválidos.' }, { status: 400, headers });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json({ error: 'Os dados enviados são inválidos.' }, { status: 400, headers });
  }

  const subscriptionId = String(body.subscriptionId || '').trim();
  const action = String(body.action || '');
  if (!subscriptionId || !['update', 'pause', 'resume'].includes(action)) {
    return Response.json({ error: 'Informe uma conta e uma ação válidas.' }, { status: 400, headers });
  }
  const subscriptionData = action === 'update' ? readSubscription(body) : null;
  if (action === 'update' && !subscriptionData) {
    return Response.json({ error: 'Confira os dados da conta, o valor, o vencimento e a frequência.' }, { status: 400, headers });
  }
  const actor = erpActorLabel(session.user);

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const current = await transaction.companyServiceSubscription.findUnique({ where: { id: subscriptionId } });
      if (!current) return { error: 'Conta ou serviço não encontrado.', status: 404 };
      if (action === 'update') {
        const category = await getValidExpenseCategory(transaction, subscriptionData.categoryId);
        if (!category) return { error: 'Selecione uma conta analítica ativa do plano de despesas.', status: 400 };
      }

      const next = action === 'update'
        ? await transaction.companyServiceSubscription.update({
          where: { id: subscriptionId },
          data: { ...subscriptionData, updatedBy: actor },
        })
        : await transaction.companyServiceSubscription.update({
          where: { id: subscriptionId },
          data: { active: action === 'resume', updatedBy: actor },
        });

      await transaction.companyServiceSubscriptionAuditLog.create({
        data: {
          subscriptionId,
          action: action === 'update' ? 'UPDATED' : action === 'pause' ? 'PAUSED' : 'RESUMED',
          actor,
          snapshot: {
            name: next.name,
            provider: next.provider,
            amount: next.amount.toString(),
            nextDueAt: next.nextDueAt.toISOString(),
            billingCycle: next.billingCycle,
            autoRenew: next.autoRenew,
            active: next.active,
            categoryId: next.categoryId,
          },
        },
      });

      if (action === 'update') {
        const period = getSubscriptionPeriod(next.nextDueAt, next.billingCycle);
        const openExpense = await transaction.companyExpense.findFirst({
          where: { serviceSubscriptionId: subscriptionId, status: 'Em aberto' },
          orderBy: { dueAt: 'asc' },
        });
        if (openExpense) {
          await transaction.companyExpense.update({
            where: { id: openExpense.id },
            data: {
              description: `${next.provider}: ${next.name}`,
              amount: next.amount,
              competenceAt: next.nextDueAt,
              dueAt: next.nextDueAt,
              notes: next.notes,
              categoryId: next.categoryId,
              subscriptionPeriod: period,
            },
          });
        } else if (next.active) {
          await addSubscriptionExpense(transaction, next, actor);
        }
      } else if (action === 'resume') {
        const openExpense = await transaction.companyExpense.findFirst({
          where: { serviceSubscriptionId: subscriptionId, status: 'Em aberto' },
        });
        if (!openExpense && next.billingCycle !== 'ONCE') {
          const latestPaidExpense = await transaction.companyExpense.findFirst({
            where: { serviceSubscriptionId: subscriptionId, status: 'Paga' },
            orderBy: { dueAt: 'desc' },
          });
          if (latestPaidExpense) {
            const followingDueAt = getNextSubscriptionDueDate(latestPaidExpense.dueAt, next.billingCycle);
            if (followingDueAt && followingDueAt > next.nextDueAt.toISOString().slice(0, 10)) {
              next.nextDueAt = new Date(`${followingDueAt}T00:00:00.000Z`);
              await transaction.companyServiceSubscription.update({
                where: { id: next.id },
                data: { nextDueAt: next.nextDueAt },
              });
            }
          }
          await addSubscriptionExpense(transaction, next, actor);
        }
      }

      return {
        subscription: await transaction.companyServiceSubscription.findUnique({
          where: { id: subscriptionId },
          include: { category: { select: { id: true, code: true, name: true } } },
        }),
      };
    });
    if (result.error) return Response.json({ error: result.error }, { status: result.status, headers });
    return Response.json(result, { headers });
  } catch (error) {
    if (error instanceof RangeError) return Response.json({ error: error.message }, { status: 400, headers });
    if (error?.code === 'P2002') return Response.json({ error: 'Já existe um lançamento para esse período. Atualize os dados e tente novamente.' }, { status: 409, headers });
    console.error('Não foi possível atualizar a conta ou serviço:', error);
    return Response.json({ error: 'Não foi possível atualizar a conta ou serviço.' }, { status: 503, headers });
  }
}
