import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { erpActorLabel, hasErpAccess } from '@/features/erp/access';
import { prisma } from '@/lib/prisma';
import { automaticChartAccounts } from '@/features/erp/api/financial-metrics';
import { getNextSubscriptionDueDate, getSubscriptionPeriod } from '@/features/erp/api/company-subscriptions';

const headers = { 'Cache-Control': 'private, no-store, max-age=0' };
const expenseBehaviors = new Set(['FIXED', 'VARIABLE', 'FINANCIAL', 'TAX', 'OTHER']);
const accountTypes = new Set(['BANK', 'CASH', 'DIGITAL']);
const accountNatures = new Set(['EXPENSE', 'REVENUE', 'ASSET', 'LIABILITY', 'EQUITY']);

function dateOnly(value, optional = false) {
  if (optional && !value) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : undefined;
}

function parseMoney(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && Math.abs(value) <= 999999999999.99 ? value : null;
  }
  if (typeof value !== 'string' || !/^-?\d{1,12}(?:[.,]\d{1,2})?$/.test(value.trim())) return null;
  const amount = Number(value.replace(',', '.'));
  return Number.isFinite(amount) && Math.abs(amount) <= 999999999999.99 ? amount : null;
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers });

  try {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const todayDate = dateOnly(today);
    const weekEnd = new Date(todayDate);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
    await prisma.financialChartAccount.createMany({
      data: automaticChartAccounts,
      skipDuplicates: true,
    });
    const [chartAccounts, financialAccounts, expenses, subscriptions, openCount, openTotal, overdueCount, dueTodayCount, dueNextSevenDays] = await Promise.all([
      prisma.financialChartAccount.findMany({
        orderBy: [{ active: 'desc' }, { code: 'asc' }],
      }),
      prisma.companyFinancialAccount.findMany({
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
      }),
      Promise.all([
        prisma.companyExpense.findMany({
          where: { status: 'Em aberto' },
          take: 250,
          include: {
            category: { select: { id: true, code: true, name: true, expenseBehavior: true } },
            financialAccount: { select: { id: true, name: true } },
            serviceSubscription: { select: { id: true, provider: true, plan: true, accountEmail: true, managementUrl: true, paymentMethod: true, billingCycle: true, autoRenew: true } },
          },
          orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
        }),
        prisma.companyExpense.findMany({
          where: { status: { in: ['Paga', 'Cancelada'] } },
          take: 250,
          include: {
            category: { select: { id: true, code: true, name: true, expenseBehavior: true } },
            financialAccount: { select: { id: true, name: true } },
            serviceSubscription: { select: { id: true, provider: true, plan: true, accountEmail: true, managementUrl: true, paymentMethod: true, billingCycle: true, autoRenew: true } },
          },
          orderBy: { createdAt: 'desc' },
        }),
      ]),
      prisma.companyServiceSubscription.findMany({
        include: { category: { select: { id: true, code: true, name: true } } },
        orderBy: [{ active: 'desc' }, { nextDueAt: 'asc' }, { provider: 'asc' }],
      }),
      prisma.companyExpense.count({ where: { status: 'Em aberto' } }),
      prisma.companyExpense.aggregate({ where: { status: 'Em aberto' }, _sum: { amount: true } }),
      prisma.companyExpense.count({ where: { status: 'Em aberto', dueAt: { lt: todayDate } } }),
      prisma.companyExpense.count({ where: { status: 'Em aberto', dueAt: todayDate } }),
      prisma.companyExpense.count({ where: { status: 'Em aberto', dueAt: { gt: todayDate, lte: weekEnd } } }),
    ]);

    return Response.json({
      chartAccounts,
      financialAccounts,
      expenses: [...expenses[0], ...expenses[1]],
      subscriptions,
      dueSummary: {
        openCount,
        openAmount: Number(openTotal._sum.amount || 0),
        overdueCount,
        dueTodayCount,
        dueNextSevenDays,
      },
    }, { headers });
  } catch (error) {
    console.error('Não foi possível carregar os cadastros do financeiro:', error);
    return Response.json({ error: 'Não foi possível carregar os cadastros financeiros.' }, { status: 503, headers });
  }
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers });
  const body = await readBody(request);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json({ error: 'O conteúdo enviado não é válido.' }, { status: 400, headers });
  }

  const actor = erpActorLabel(session.user);
  try {
    if (body.kind === 'chartAccount') {
      const code = String(body.code || '').trim();
      const name = String(body.name || '').trim();
      const nature = String(body.nature || 'EXPENSE');
      const expenseBehavior = body.expenseBehavior ? String(body.expenseBehavior) : null;
      if (!code || code.length > 30 || !name || name.length > 120 || !accountNatures.has(nature)) {
        return Response.json({ error: 'Informe código, nome e natureza válidos para a conta contábil.' }, { status: 400, headers });
      }
      if ((nature === 'EXPENSE' && !expenseBehaviors.has(expenseBehavior))
        || (nature !== 'EXPENSE' && expenseBehavior !== null)) {
        return Response.json({ error: 'Classifique as despesas por comportamento; outras naturezas não recebem classificação de despesa.' }, { status: 400, headers });
      }
      const chartAccount = await prisma.financialChartAccount.create({
        data: { code, name, nature, expenseBehavior },
      });
      return Response.json({ chartAccount }, { status: 201, headers });
    }

    if (body.kind === 'chartAccountsImport') {
      if (!Array.isArray(body.accounts) || body.accounts.length === 0 || body.accounts.length > 500) {
        return Response.json({ error: 'Envie de 1 a 500 contas no arquivo CSV.' }, { status: 400, headers });
      }
      const importedCodes = new Set();
      const accounts = [];
      for (const [index, item] of body.accounts.entries()) {
        const code = String(item?.code || '').trim();
        const name = String(item?.name || '').trim();
        const nature = String(item?.nature || '');
        const expenseBehavior = item?.expenseBehavior ? String(item.expenseBehavior) : null;
        if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,29}$/.test(code) || !name || name.length > 120
          || !accountNatures.has(nature)) {
          return Response.json({ error: `A conta na linha ${index + 2} tem código, nome ou natureza inválidos.` }, { status: 400, headers });
        }
        if ((nature === 'EXPENSE' && !expenseBehaviors.has(expenseBehavior))
          || (nature !== 'EXPENSE' && expenseBehavior !== null)) {
          return Response.json({ error: `A classificação da conta ${code} não é válida.` }, { status: 400, headers });
        }
        if (importedCodes.has(code)) {
          return Response.json({ error: `O código ${code} está repetido no arquivo CSV.` }, { status: 400, headers });
        }
        importedCodes.add(code);
        accounts.push({ code, name, nature, expenseBehavior });
      }
      const result = await prisma.financialChartAccount.createMany({ data: accounts, skipDuplicates: true });
      return Response.json({
        createdCount: result.count,
        skippedCount: accounts.length - result.count,
      }, { status: 201, headers });
    }

    if (body.kind === 'financialAccount') {
      const name = String(body.name || '').trim();
      const institution = String(body.institution || '').trim() || null;
      const accountType = String(body.accountType || '');
      const openingBalance = parseMoney(body.openingBalance);
      const balanceAsOf = dateOnly(body.balanceAsOf);
      if (!name || name.length > 120 || (institution && institution.length > 120)
        || !accountTypes.has(accountType) || openingBalance === null || balanceAsOf === undefined) {
        return Response.json({ error: 'Informe nome, tipo, saldo inicial e data de referência válidos.' }, { status: 400, headers });
      }
      const financialAccount = await prisma.companyFinancialAccount.create({
        data: { name, institution, accountType, openingBalance, balanceAsOf },
      });
      return Response.json({ financialAccount }, { status: 201, headers });
    }

    if (body.kind === 'expense') {
      const description = String(body.description || '').trim();
      const amount = parseMoney(body.amount);
      const competenceAt = dateOnly(body.competenceAt);
      const dueAt = dateOnly(body.dueAt, true);
      const categoryId = String(body.categoryId || '').trim();
      const notes = String(body.notes || '').trim() || null;
      const provider = String(body.provider || '').trim() || null;
      const plan = String(body.plan || '').trim() || null;
      const accountEmail = String(body.accountEmail || '').trim() || null;
      const managementUrl = String(body.managementUrl || '').trim() || null;
      const paymentMethod = String(body.paymentMethod || '').trim() || null;
      if (!description || description.length > 180 || amount === null || amount <= 0
        || competenceAt === undefined || dueAt === undefined || !categoryId || (notes && notes.length > 1000)
        || (provider && provider.length > 80) || (plan && plan.length > 100)
        || (accountEmail && (accountEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountEmail)))
        || (managementUrl && managementUrl.length > 500) || (paymentMethod && paymentMethod.length > 80)) {
        return Response.json({ error: 'Informe descrição, valor positivo, competência e conta de despesa válidos.' }, { status: 400, headers });
      }
      if (managementUrl) {
        try {
          const url = new URL(managementUrl);
          if (!['http:', 'https:'].includes(url.protocol)) {
            return Response.json({ error: 'O link de gestão deve começar com http:// ou https://.' }, { status: 400, headers });
          }
        } catch {
          return Response.json({ error: 'Informe um link de gestão válido.' }, { status: 400, headers });
        }
      }

      const category = await prisma.financialChartAccount.findFirst({
        where: { id: categoryId, nature: 'EXPENSE', active: true },
        select: { id: true, code: true },
      });
      if (!category) return Response.json({ error: 'A conta contábil não existe ou está inativa.' }, { status: 400, headers });
      const childAccount = await prisma.financialChartAccount.findFirst({
        where: { active: true, code: { startsWith: `${category.code}.` } },
        select: { id: true },
      });
      if (childAccount) return Response.json({ error: 'Selecione uma conta analítica sem subcontas para lançar a despesa.' }, { status: 400, headers });

      const expense = await prisma.$transaction(async (transaction) => {
        const created = await transaction.companyExpense.create({
          data: {
            description,
            amount,
            competenceAt,
            dueAt,
            notes,
            provider,
            plan,
            accountEmail,
            managementUrl,
            paymentMethod,
            categoryId,
            createdBy: actor,
          },
          include: { category: { select: { id: true, code: true, name: true, expenseBehavior: true } } },
        });
        await transaction.companyExpenseAuditLog.create({
          data: {
            expenseId: created.id,
            action: 'CREATED',
            actor,
            snapshot: {
              description: created.description,
              amount: created.amount.toString(),
              competenceAt: created.competenceAt.toISOString(),
              dueAt: created.dueAt?.toISOString() || null,
              status: created.status,
              categoryId: created.categoryId,
              provider: created.provider,
              plan: created.plan,
              accountEmail: created.accountEmail,
              managementUrl: created.managementUrl,
              paymentMethod: created.paymentMethod,
            },
          },
        });
        return created;
      });
      return Response.json({ expense }, { status: 201, headers });
    }

    return Response.json({ error: 'Tipo de cadastro financeiro desconhecido.' }, { status: 400, headers });
  } catch (error) {
    if (error?.code === 'P2002') return Response.json({ error: 'Esse código já está cadastrado no plano de contas.' }, { status: 409, headers });
    console.error('Não foi possível salvar o cadastro financeiro:', error);
    return Response.json({ error: 'Não foi possível salvar o cadastro financeiro.' }, { status: 503, headers });
  }
}

export async function PATCH(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers });
  const body = await readBody(request);
  const expenseId = String(body?.expenseId || '').trim();
  const action = String(body?.action || '');
  if (!expenseId || !['pay', 'cancel', 'update'].includes(action)) {
    return Response.json({ error: 'Informe uma despesa e uma ação válida.' }, { status: 400, headers });
  }

  if (action === 'update') {
    const description = String(body.description || '').trim();
    const amount = parseMoney(body.amount);
    const competenceAt = dateOnly(body.competenceAt);
    const dueAt = dateOnly(body.dueAt, true);
    const categoryId = String(body.categoryId || '').trim();
    const notes = String(body.notes || '').trim() || null;
    const provider = String(body.provider || '').trim() || null;
    const plan = String(body.plan || '').trim() || null;
    const accountEmail = String(body.accountEmail || '').trim() || null;
    const managementUrl = String(body.managementUrl || '').trim() || null;
    const paymentMethod = String(body.paymentMethod || '').trim() || null;
    if (!description || description.length > 180 || amount === null || amount <= 0
      || competenceAt === undefined || dueAt === undefined || !categoryId || (notes && notes.length > 1000)
      || (provider && provider.length > 80) || (plan && plan.length > 100)
      || (accountEmail && (accountEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountEmail)))
      || (managementUrl && managementUrl.length > 500) || (paymentMethod && paymentMethod.length > 80)) {
      return Response.json({ error: 'Confira descrição, valor, datas, categoria e dados opcionais da despesa.' }, { status: 400, headers });
    }
    if (managementUrl) {
      try {
        const url = new URL(managementUrl);
        if (!['http:', 'https:'].includes(url.protocol)) {
          return Response.json({ error: 'O link de gestão deve começar com http:// ou https://.' }, { status: 400, headers });
        }
      } catch {
        return Response.json({ error: 'Informe um link de gestão válido.' }, { status: 400, headers });
      }
    }

    const actor = erpActorLabel(session.user);
    try {
      const result = await prisma.$transaction(async (transaction) => {
        const category = await transaction.financialChartAccount.findFirst({
          where: { id: categoryId, nature: 'EXPENSE', active: true },
          select: { id: true, code: true },
        });
        if (!category) return { invalidCategory: true };
        const childAccount = await transaction.financialChartAccount.findFirst({
          where: { active: true, code: { startsWith: `${category.code}.` } },
          select: { id: true },
        });
        if (childAccount) return { invalidCategory: true };

        const current = await transaction.companyExpense.findUnique({
          where: { id: expenseId },
          select: { id: true, status: true, serviceSubscriptionId: true },
        });
        if (!current) return { notFound: true };
        if (current.status !== 'Em aberto' || current.serviceSubscriptionId) return { conflict: true };
        const changed = await transaction.companyExpense.updateMany({
          where: { id: expenseId, status: 'Em aberto', serviceSubscriptionId: null },
          data: {
            description,
            amount,
            competenceAt,
            dueAt,
            categoryId,
            notes,
            provider,
            plan,
            accountEmail,
            managementUrl,
            paymentMethod,
          },
        });
        if (changed.count !== 1) return { conflict: true };
        const expense = await transaction.companyExpense.findUnique({
          where: { id: expenseId },
          include: { category: { select: { id: true, code: true, name: true, expenseBehavior: true } } },
        });
        await transaction.companyExpenseAuditLog.create({
          data: {
            expenseId,
            action: 'UPDATED',
            actor,
            snapshot: {
              description: expense.description,
              amount: expense.amount.toString(),
              competenceAt: expense.competenceAt.toISOString(),
              dueAt: expense.dueAt?.toISOString() || null,
              categoryId: expense.categoryId,
              notes: expense.notes,
              provider: expense.provider,
              plan: expense.plan,
              accountEmail: expense.accountEmail,
              managementUrl: expense.managementUrl,
              paymentMethod: expense.paymentMethod,
            },
          },
        });
        return { expense };
      });
      if (result.notFound) return Response.json({ error: 'Despesa não encontrada.' }, { status: 404, headers });
      if (result.invalidCategory) return Response.json({ error: 'Selecione uma categoria analítica ativa do plano de despesas.' }, { status: 400, headers });
      if (result.conflict) return Response.json({ error: 'Somente despesas avulsas em aberto podem ser editadas. Contas recorrentes são editadas na seção de assinaturas.' }, { status: 409, headers });
      return Response.json({ expense: result.expense }, { headers });
    } catch (error) {
      console.error('Não foi possível editar a despesa:', error);
      return Response.json({ error: 'Não foi possível editar a despesa.' }, { status: 503, headers });
    }
  }

  const financialAccountId = action === 'pay' ? String(body.financialAccountId || '').trim() : '';
  if (action === 'pay' && !financialAccountId) {
    return Response.json({ error: 'Selecione a conta da empresa usada para pagar a despesa.' }, { status: 400, headers });
  }
  const actor = erpActorLabel(session.user);
  try {
    const updated = await prisma.$transaction(async (transaction) => {
      const current = await transaction.companyExpense.findUnique({
        where: { id: expenseId },
        include: { serviceSubscription: true },
      });
      if (!current) return null;
      if (current.status !== 'Em aberto') {
        return { conflict: true };
      }
      if (action === 'pay') {
        const activeAccount = await transaction.companyFinancialAccount.findFirst({
          where: { id: financialAccountId, active: true },
          select: { id: true },
        });
        if (!activeAccount) return { invalidAccount: true };
      }
      const changed = await transaction.companyExpense.updateMany({
        where: { id: expenseId, status: 'Em aberto' },
        data: action === 'pay'
          ? { status: 'Paga', paidAt: new Date(), financialAccountId: financialAccountId || null }
          : { status: 'Cancelada' },
      });
      if (changed.count !== 1) return { conflict: true };
      if (action === 'pay' && current.serviceSubscription) {
        const subscription = current.serviceSubscription;
        const followingDueAt = getNextSubscriptionDueDate(current.dueAt || subscription.nextDueAt, subscription.billingCycle);
        if (followingDueAt) {
          const nextDate = new Date(`${followingDueAt}T00:00:00.000Z`);
          const period = getSubscriptionPeriod(nextDate, subscription.billingCycle);
          await transaction.companyServiceSubscription.update({
            where: { id: subscription.id },
            data: {
              nextDueAt: nextDate,
              ...(!subscription.autoRenew && subscription.active ? { active: false } : {}),
            },
          });
          if (subscription.autoRenew && subscription.active) {
            const nextExpense = await transaction.companyExpense.create({
              data: {
                description: `${subscription.provider}: ${subscription.name}`,
                amount: subscription.amount,
                competenceAt: nextDate,
                dueAt: nextDate,
                notes: subscription.notes,
                provider: subscription.provider,
                plan: subscription.plan,
                accountEmail: subscription.accountEmail,
                managementUrl: subscription.managementUrl,
                paymentMethod: subscription.paymentMethod,
                createdBy: actor,
                categoryId: subscription.categoryId,
                serviceSubscriptionId: subscription.id,
                subscriptionPeriod: period,
              },
            });
            await transaction.companyExpenseAuditLog.create({
              data: {
                expenseId: nextExpense.id,
                action: 'CREATED',
                actor,
                snapshot: {
                  description: nextExpense.description,
                  amount: nextExpense.amount.toString(),
                  competenceAt: nextExpense.competenceAt.toISOString(),
                  dueAt: nextExpense.dueAt?.toISOString() || null,
                  status: nextExpense.status,
                  categoryId: nextExpense.categoryId,
                  provider: nextExpense.provider,
                  plan: nextExpense.plan,
                  accountEmail: nextExpense.accountEmail,
                  managementUrl: nextExpense.managementUrl,
                  paymentMethod: nextExpense.paymentMethod,
                  serviceSubscriptionId: subscription.id,
                },
              },
            });
          }
          await transaction.companyServiceSubscriptionAuditLog.create({
            data: {
              subscriptionId: subscription.id,
              action: subscription.autoRenew && subscription.active ? 'NEXT_CYCLE_CREATED' : 'MANUAL_RENEWAL_DUE',
              actor,
              snapshot: { nextDueAt: nextDate.toISOString(), amount: subscription.amount.toString() },
            },
          });
        } else if (subscription.active) {
          await transaction.companyServiceSubscription.update({
            where: { id: subscription.id },
            data: { active: false },
          });
          await transaction.companyServiceSubscriptionAuditLog.create({
            data: {
              subscriptionId: subscription.id,
              action: 'RENEWAL_COMPLETED',
              actor,
              snapshot: { billingCycle: subscription.billingCycle, autoRenew: subscription.autoRenew },
            },
          });
        }
      }
      const next = await transaction.companyExpense.findUnique({
        where: { id: expenseId },
        include: {
          category: { select: { id: true, code: true, name: true, expenseBehavior: true } },
          financialAccount: { select: { id: true, name: true } },
        },
      });
      await transaction.companyExpenseAuditLog.create({
        data: {
          expenseId,
          action: action === 'pay' ? 'PAID' : 'CANCELLED',
          actor,
          snapshot: {
            status: next.status,
            amount: next.amount.toString(),
            paidAt: next.paidAt?.toISOString() || null,
            financialAccountId: next.financialAccountId,
          },
        },
      });
      return { expense: next };
    });
    if (!updated) return Response.json({ error: 'Despesa não encontrada.' }, { status: 404, headers });
    if (updated.conflict) return Response.json({ error: 'Somente despesas em aberto podem ser pagas ou canceladas.' }, { status: 409, headers });
    if (updated.invalidAccount) return Response.json({ error: 'A conta financeira não existe ou está inativa. Atualize a lista e selecione outra.' }, { status: 409, headers });
    return Response.json({ expense: updated.expense }, { headers });
  } catch (error) {
    console.error('Não foi possível atualizar a despesa:', error);
    return Response.json({ error: 'Não foi possível atualizar a despesa.' }, { status: 503, headers });
  }
}

export async function DELETE(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers });
  const body = await readBody(request);
  const financialAccountId = String(body?.financialAccountId || '').trim();
  if (!financialAccountId) {
    return Response.json({ error: 'Informe a conta da empresa que deseja excluir.' }, { status: 400, headers });
  }

  try {
    const account = await prisma.companyFinancialAccount.findUnique({
      where: { id: financialAccountId },
      select: { id: true },
    });
    if (!account) return Response.json({ error: 'A conta da empresa não foi encontrada.' }, { status: 404, headers });

    const linkedExpenses = await prisma.companyExpense.count({ where: { financialAccountId } });
    if (linkedExpenses > 0) {
      await prisma.companyFinancialAccount.update({
        where: { id: financialAccountId },
        data: { active: false },
      });
      return Response.json({ deleted: false, archived: true }, { headers });
    }

    await prisma.companyFinancialAccount.delete({ where: { id: financialAccountId } });
    return Response.json({ deleted: true, archived: false }, { headers });
  } catch (error) {
    if (error?.code === 'P2003') {
      return Response.json({ error: 'A conta passou a ter lançamentos associados. Atualize a tela e tente novamente.' }, { status: 409, headers });
    }
    console.error('Não foi possível excluir a conta da empresa:', error);
    return Response.json({ error: 'Não foi possível excluir a conta da empresa.' }, { status: 503, headers });
  }
}
