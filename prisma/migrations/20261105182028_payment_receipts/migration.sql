/*
  Warnings:

  - A unique constraint covering the columns `[receiptNumber]` on the table `ops_payments` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "billing_settings" ADD COLUMN     "receiptPrefix" TEXT NOT NULL DEFAULT 'RC';

-- AlterTable
ALTER TABLE "ops_payments" ADD COLUMN     "receiptNumber" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ops_payments_receiptNumber_key" ON "ops_payments"("receiptNumber");
