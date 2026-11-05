/*
  Warnings:

  - A unique constraint covering the columns `[razorpaySubscriptionId]` on the table `organization_subscriptions` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "CollectionMethod" ADD VALUE 'AUTO_DEBIT';

-- AlterEnum
ALTER TYPE "PaymentSource" ADD VALUE 'RAZORPAY_SUBSCRIPTION';

-- AlterTable
ALTER TABLE "organization_subscriptions" ADD COLUMN     "lastPaymentError" TEXT,
ADD COLUMN     "lastPaymentErrorAt" TIMESTAMP(3),
ADD COLUMN     "razorpaySubscriptionId" TEXT;

-- CreateTable
CREATE TABLE "razorpay_subscriptions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "billingCycle" "BillingCycle" NOT NULL,
    "razorpayPlanId" TEXT NOT NULL,
    "baseAmount" DECIMAL(10,2) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "shortUrl" TEXT,
    "startAt" TIMESTAMP(3),
    "currentStart" TIMESTAMP(3),
    "currentEnd" TIMESTAMP(3),
    "paymentMethod" TEXT,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "razorpay_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "razorpay_plans" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "billingCycle" "BillingCycle" NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "razorpay_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "razorpay_subscriptions_organizationId_idx" ON "razorpay_subscriptions"("organizationId");

-- CreateIndex
CREATE INDEX "razorpay_subscriptions_status_idx" ON "razorpay_subscriptions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "razorpay_plans_planId_billingCycle_amountPaise_key" ON "razorpay_plans"("planId", "billingCycle", "amountPaise");

-- CreateIndex
CREATE UNIQUE INDEX "organization_subscriptions_razorpaySubscriptionId_key" ON "organization_subscriptions"("razorpaySubscriptionId");
