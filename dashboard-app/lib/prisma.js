import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis;
const connectionString = process.env.DATABASE_URL;

function getPrismaClient() {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  if (!connectionString) throw new Error('DATABASE_URL precisa estar configurada para acessar o banco de dados.');

  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 1 }) });
  globalForPrisma.prisma = client;
  return client;
}

export const prisma = new Proxy({}, {
  get(_target, property) {
    const client = getPrismaClient();
    const value = Reflect.get(client, property, client);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
