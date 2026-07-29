/*
  Warnings:

  - You are about to drop the column `billingCycle` on the `subscription_plans` table. All the data in the column will be lost.
  - You are about to drop the column `price` on the `subscription_plans` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "OpsPaymentStatus" ADD VALUE 'CREATED';

-- AlterTable
ALTER TABLE "ops_payments" ADD COLUMN     "baseAmount" DECIMAL(10,2),
ADD COLUMN     "billingCycle" "BillingCycle",
ADD COLUMN     "gatewayFeeAmount" DECIMAL(10,2),
ADD COLUMN     "gstAmount" DECIMAL(10,2),
ADD COLUMN     "periodMonths" INTEGER,
ADD COLUMN     "planId" TEXT,
ALTER COLUMN "status" SET DEFAULT 'CREATED';

-- AlterTable
ALTER TABLE "organization_subscriptions" ADD COLUMN     "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
ADD COLUMN     "periodMonths" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "subscription_plans" DROP COLUMN "billingCycle",
DROP COLUMN "price",
ADD COLUMN     "allowsAnnual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "allowsMonthly" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "annualPrice" DECIMAL(10,2),
ADD COLUMN     "monthlyPrice" DECIMAL(10,2);

-- CreateIndex
CREATE INDEX "ops_payments_planId_idx" ON "ops_payments"("planId");
