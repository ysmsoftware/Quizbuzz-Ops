-- CreateEnum
CREATE TYPE "OverrideMode" AS ENUM ('ADDITIVE', 'ABSOLUTE');

-- AlterTable
ALTER TABLE "subscription_overrides" ADD COLUMN     "mode" "OverrideMode" NOT NULL DEFAULT 'ABSOLUTE';
