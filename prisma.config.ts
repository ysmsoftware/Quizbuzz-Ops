import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

import { defineConfig } from '@prisma/config';

const clean = (val: string | undefined): string | null => {
  if (!val) return null;
  const trimmed = val.replace(/\r/g, '').trim().replace(/^["']|["']$/g, '').trim();
  return trimmed.length > 0 ? trimmed : null;
};

const dbUrl =
  clean(process.env.OPS_DATABASE_URL) ||
  clean(process.env.DATABASE_URL) ||
  clean(process.env.PRISMA_DATABASE_URL) ||
  clean(process.env.DIRECT_URL) ||
  '';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'node prisma/seed.js',
  },
  datasource: {
    url: dbUrl,
  },
});
