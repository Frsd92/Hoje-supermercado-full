import { promises as fs } from 'fs';
import path from 'path';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { sortOrdersNewestFirst } from '@/lib/order-sort';

const ordersFile = path.join(process.cwd(), 'data', 'orders.json');

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return Response.json({ orders: [] }, { status: 401 });

  try {
    const orders = JSON.parse(await fs.readFile(ordersFile, 'utf8'));
    return Response.json({ orders: sortOrdersNewestFirst(orders.filter((order) => order.customerEmail === session.user.email)) });
  } catch {
    return Response.json({ orders: [] });
  }
}
