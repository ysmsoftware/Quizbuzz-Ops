-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OpsMessageTemplate" ADD VALUE 'CREDIT_NOTE_ISSUED';
ALTER TYPE "OpsMessageTemplate" ADD VALUE 'SUBSCRIPTION_CHANGE_SCHEDULED';

-- AlterTable
ALTER TABLE "billing_settings" ADD COLUMN     "creditNotePrefix" TEXT NOT NULL DEFAULT 'CN';

-- AlterTable
ALTER TABLE "contest_bookings" ADD COLUMN     "commissionPercent" DECIMAL(5,2),
ADD COLUMN     "contestId" TEXT,
ADD COLUMN     "payOption" TEXT NOT NULL DEFAULT 'UPFRONT';

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "aiCredits" INTEGER,
ADD COLUMN     "creditedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "organization_subscriptions" ADD COLUMN     "scheduledBillingCycle" "BillingCycle",
ADD COLUMN     "scheduledById" TEXT,
ADD COLUMN     "scheduledPlanId" TEXT,
ADD COLUMN     "scheduledReason" TEXT;

-- AlterTable
ALTER TABLE "subscription_overrides" ADD COLUMN     "bookingId" TEXT;

-- CreateTable
CREATE TABLE "credit_notes" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "paymentId" TEXT,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "cgstAmount" DECIMAL(12,2) NOT NULL,
    "sgstAmount" DECIMAL(12,2) NOT NULL,
    "igstAmount" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "refundMethod" TEXT NOT NULL,
    "refundReference" TEXT,
    "razorpayRefundId" TEXT,
    "endedAccess" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_credit_top_ups" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "invoiceId" TEXT,
    "reason" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_credit_top_ups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_number_key" ON "credit_notes"("number");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_razorpayRefundId_key" ON "credit_notes"("razorpayRefundId");

-- CreateIndex
CREATE INDEX "credit_notes_invoiceId_idx" ON "credit_notes"("invoiceId");

-- CreateIndex
CREATE INDEX "credit_notes_organizationId_idx" ON "credit_notes"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_credit_top_ups_invoiceId_key" ON "ai_credit_top_ups"("invoiceId");

-- CreateIndex
CREATE INDEX "ai_credit_top_ups_organizationId_expiresAt_idx" ON "ai_credit_top_ups"("organizationId", "expiresAt");

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
