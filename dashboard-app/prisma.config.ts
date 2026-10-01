import dotenv from 'dotenv';
import { defineConfig } from 'prisma/config';

dotenv.config({ path: '.env.local' });
dotenv.config();

const datasourceUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  ...(datasourceUrl ? { datasource: { url: datasourceUrl } } : {}),
});
