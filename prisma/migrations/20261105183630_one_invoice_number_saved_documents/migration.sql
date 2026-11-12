/*
  Warnings:

  - You are about to drop the column `proformaPrefix` on the `billing_settings` table. All the data in the column will be lost.
  - You are about to drop the column `proformaNumber` on the `invoices` table. All the data in the column will be lost.
  - You are about to drop the column `taxInvoiceNumber` on the `invoices` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[invoiceNumber]` on the table `invoices` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `invoiceNumber` to the `invoices` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "invoices_proformaNumber_key";

-- DropIndex
DROP INDEX "invoices_taxInvoiceNumber_key";

-- AlterTable
ALTER TABLE "billing_settings" DROP COLUMN "proformaPrefix",
ALTER COLUMN "invoicePrefix" SET DEFAULT 'INV',
ALTER COLUMN "receiptPrefix" SET DEFAULT 'REC';

-- AlterTable
ALTER TABLE "invoices" DROP COLUMN "proformaNumber",
DROP COLUMN "taxInvoiceNumber",
ADD COLUMN     "invoiceNumber" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "billing_documents" (
    "number" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "paymentId" TEXT,
    "fileName" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_documents_pkey" PRIMARY KEY ("number")
);

-- CreateIndex
CREATE INDEX "billing_documents_invoiceId_idx" ON "billing_documents"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoiceNumber_key" ON "invoices"("invoiceNumber");
