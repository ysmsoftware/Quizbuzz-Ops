import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.production') });
dotenv.config();

import { defineConfig } from '@prisma/config';

const dbUrl =
  process.env.OPS_DATABASE_URL ||
  process.env.DATABASE_URL ||
  process.env.DIRECT_URL ||
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
