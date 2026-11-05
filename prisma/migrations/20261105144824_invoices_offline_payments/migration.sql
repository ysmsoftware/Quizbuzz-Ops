-- CreateEnum
CREATE TYPE "CollectionMethod" AS ENUM ('PAY_ONLINE', 'OFFLINE', 'COMPLIMENTARY');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "InvoiceAccessMode" AS ENUM ('ACCESS_NOW', 'ON_PAYMENT');

-- CreateEnum
CREATE TYPE "PaymentSource" AS ENUM ('RAZORPAY_ORDER', 'RAZORPAY_LINK', 'BANK_TRANSFER', 'CHEQUE', 'UPI_DIRECT', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'WON', 'LOST');

-- AlterEnum
ALTER TYPE "AuditTargetType" ADD VALUE 'INVOICE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BillingCycle" ADD VALUE 'HALF_YEARLY';
ALTER TYPE "BillingCycle" ADD VALUE 'CUSTOM';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OpsMessageTemplate" ADD VALUE 'INVOICE_ISSUED';
ALTER TYPE "OpsMessageTemplate" ADD VALUE 'INVOICE_REMINDER';
ALTER TYPE "OpsMessageTemplate" ADD VALUE 'CONTRACT_ENDING';

-- AlterTable
ALTER TABLE "ops_payments" ADD COLUMN     "invoiceId" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "receivedAt" TIMESTAMP(3),
ADD COLUMN     "recordedById" TEXT,
ADD COLUMN     "reference" TEXT,
ADD COLUMN     "source" "PaymentSource" NOT NULL DEFAULT 'RAZORPAY_ORDER',
ADD COLUMN     "tdsAmount" DECIMAL(10,2),
ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedById" TEXT;

-- AlterTable
ALTER TABLE "organization_subscriptions" ADD COLUMN     "collectionMethod" "CollectionMethod" NOT NULL DEFAULT 'PAY_ONLINE',
ADD COLUMN     "contractEnd" TIMESTAMP(3),
ADD COLUMN     "contractNotes" TEXT,
ADD COLUMN     "contractReminderDays" INTEGER,
ADD COLUMN     "contractStart" TIMESTAMP(3),
ADD COLUMN     "poNumber" TEXT;

-- CreateTable
CREATE TABLE "payment_proofs" (
    "paymentId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_proofs_pkey" PRIMARY KEY ("paymentId")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "organizationName" TEXT NOT NULL,
    "proformaNumber" TEXT NOT NULL,
    "taxInvoiceNumber" TEXT,
    "planId" TEXT,
    "billingCycle" "BillingCycle",
    "periodMonths" INTEGER,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "description" TEXT NOT NULL,
    "collectionMethod" "CollectionMethod" NOT NULL,
    "accessMode" "InvoiceAccessMode" NOT NULL DEFAULT 'ON_PAYMENT',
    "accessGrantedAt" TIMESTAMP(3),
    "subtotal" DECIMAL(12,2) NOT NULL,
    "gstRate" DECIMAL(5,2) NOT NULL,
    "cgstAmount" DECIMAL(12,2) NOT NULL,
    "sgstAmount" DECIMAL(12,2) NOT NULL,
    "igstAmount" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "amountPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tdsAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "paidAt" TIMESTAMP(3),
    "closedReason" TEXT,
    "seller" JSONB NOT NULL,
    "buyer" JSONB NOT NULL,
    "razorpayLinkId" TEXT,
    "razorpayLinkUrl" TEXT,
    "razorpayLinkStatus" TEXT,
    "lastReminderDays" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_sequences" (
    "key" TEXT NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "billing_sequences_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "billing_settings" (
    "id" TEXT NOT NULL DEFAULT 'billing_default',
    "legalName" TEXT NOT NULL,
    "gstin" TEXT,
    "address" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "bankName" TEXT,
    "accountName" TEXT,
    "accountNumber" TEXT,
    "ifsc" TEXT,
    "upiId" TEXT,
    "proformaPrefix" TEXT NOT NULL DEFAULT 'PF',
    "invoicePrefix" TEXT NOT NULL DEFAULT 'QB',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "razorpay_webhook_events" (
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "razorpay_webhook_events_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "sales_leads" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "organization" TEXT,
    "message" TEXT,
    "learners" INTEGER,
    "source" TEXT NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_proformaNumber_key" ON "invoices"("proformaNumber");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_taxInvoiceNumber_key" ON "invoices"("taxInvoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_razorpayLinkId_key" ON "invoices"("razorpayLinkId");

-- CreateIndex
CREATE INDEX "invoices_organizationId_idx" ON "invoices"("organizationId");

-- CreateIndex
CREATE INDEX "invoices_status_dueAt_idx" ON "invoices"("status", "dueAt");

-- CreateIndex
CREATE INDEX "sales_leads_status_createdAt_idx" ON "sales_leads"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ops_payments_invoiceId_idx" ON "ops_payments"("invoiceId");

-- AddForeignKey
ALTER TABLE "ops_payments" ADD CONSTRAINT "ops_payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "ops_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
