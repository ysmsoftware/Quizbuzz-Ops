-- AlterEnum
ALTER TYPE "SubscriptionStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "ops_payments" ADD COLUMN     "creditApplied" DECIMAL(10,2);
