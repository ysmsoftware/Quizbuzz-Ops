import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.production') });
dotenv.config();

import { defineConfig } from '@prisma/config';

const getEnvVar = (name: string) => {
  const val = process.env[name];
  return val && val.trim() !== '' ? val.trim() : null;
};

const dbUrl =
  getEnvVar('OPS_DATABASE_URL') ||
  getEnvVar('DATABASE_URL') ||
  getEnvVar('DIRECT_URL') ||
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
