/*
  Warnings:

  - The values [SUBSCRIPTION_PAST_DUE] on the enum `OpsMessageTemplate` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "OpsMessageTemplate_new" AS ENUM ('BILLING_PAYMENT_SUCCESS', 'BILLING_RECEIPT', 'BILLING_PAYMENT_FAILED', 'SUBSCRIPTION_RENEWAL_REMINDER', 'SUBSCRIPTION_EXPIRED', 'SUBSCRIPTION_CANCELLED', 'SUBSCRIPTION_PLAN_CHANGED', 'SUBSCRIPTION_LIMIT_INCREASED', 'SUBSCRIPTION_LIMIT_DECREASED', 'PAYOUT_ACCOUNT_LINKED', 'PAYOUT_ACCOUNT_STATUS_CHANGED', 'ORG_SUSPENDED', 'ORG_REACTIVATED', 'CUSTOM', 'PLATFORM_ADMIN_OTP');
ALTER TABLE "ops_message_logs" ALTER COLUMN "template" TYPE "OpsMessageTemplate_new" USING ("template"::text::"OpsMessageTemplate_new");
ALTER TYPE "OpsMessageTemplate" RENAME TO "OpsMessageTemplate_old";
ALTER TYPE "OpsMessageTemplate_new" RENAME TO "OpsMessageTemplate";
DROP TYPE "public"."OpsMessageTemplate_old";
COMMIT;

-- AlterTable
ALTER TABLE "organization_subscriptions" ADD COLUMN     "renewalReminderSentAt" TIMESTAMP(3);
