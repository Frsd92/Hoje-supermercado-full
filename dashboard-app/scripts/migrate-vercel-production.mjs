import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (process.env.VERCEL !== '1' || process.env.VERCEL_ENV !== 'production') {
  console.log('Production database migration skipped outside a Vercel production build.');
  process.exit(0);
}

if (!process.env.DATABASE_URL && !process.env.DIRECT_URL) {
  throw new Error('Vercel production build is missing the production database connection.');
}

console.log('Applying pending Prisma migrations to the Vercel production database.');
const prismaCliPath = fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url));
const result = spawnSync(process.execPath, [prismaCliPath, 'migrate', 'deploy'], {
  stdio: 'inherit',
  env: process.env,
});

if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
