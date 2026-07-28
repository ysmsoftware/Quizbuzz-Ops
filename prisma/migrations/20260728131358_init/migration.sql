-- CreateEnum
CREATE TYPE "PlatformAdminRole" AS ENUM ('SUPER_ADMIN', 'SUPPORT', 'BILLING_ADMIN');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "AuditTargetType" AS ENUM ('ORGANIZATION', 'PLAN', 'SUBSCRIPTION', 'OVERRIDE', 'PAYMENT', 'BOOKING', 'PRICING_CONFIG', 'FEATURE_FLAG', 'PLATFORM_ADMIN');

-- CreateEnum
CREATE TYPE "OpsPaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "OpsMessageChannel" AS ENUM ('EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "OpsMessageStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SENT', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "OpsMessageTemplate" AS ENUM ('BILLING_PAYMENT_SUCCESS', 'BILLING_PAYMENT_FAILED', 'SUBSCRIPTION_PAST_DUE', 'SUBSCRIPTION_CANCELLED', 'SUBSCRIPTION_PLAN_CHANGED', 'PAYOUT_ACCOUNT_LINKED', 'PAYOUT_ACCOUNT_STATUS_CHANGED', 'ORG_SUSPENDED', 'ORG_REACTIVATED', 'CUSTOM');

-- CreateTable
CREATE TABLE "platform_admins" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "role" "PlatformAdminRole" NOT NULL DEFAULT 'SUPPORT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "otpCode" TEXT,
    "otpExpiresAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_admin_refresh_tokens" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "deviceInfo" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_admin_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_notes" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_suspensions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "suspendedById" TEXT NOT NULL,
    "suspendedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "liftedById" TEXT,
    "liftedAt" TIMESTAMP(3),
    "liftReason" TEXT,

    CONSTRAINT "organization_suspensions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorLabel" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" "AuditTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetLabel" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "maxContestsPerCycle" INTEGER,
    "maxParticipantsPerContest" INTEGER,
    "maxQuestionsPerContest" INTEGER,
    "maxOrgMembers" INTEGER,
    "featureProctoring" BOOLEAN NOT NULL DEFAULT false,
    "featureCertBranding" BOOLEAN NOT NULL DEFAULT false,
    "featurePrioritySupport" BOOLEAN NOT NULL DEFAULT false,
    "featureAnalyticsExport" BOOLEAN NOT NULL DEFAULT false,
    "featureCustomDomain" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_subscriptions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_overrides" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "value" INTEGER,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "removedById" TEXT,
    "removedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_change_logs" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "fromPlanId" TEXT,
    "toPlanId" TEXT NOT NULL,
    "changedById" TEXT,
    "changedVia" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_change_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ops_message_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "channel" "OpsMessageChannel" NOT NULL,
    "template" "OpsMessageTemplate" NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT,
    "params" JSONB,
    "metadata" JSONB,
    "status" "OpsMessageStatus" NOT NULL DEFAULT 'QUEUED',
    "providerMsgId" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ops_message_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ops_payments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "bookingId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "OpsPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "razorpayOrderId" TEXT,
    "razorpayPaymentId" TEXT,
    "razorpaySignature" TEXT,
    "paidAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "refundReason" TEXT,
    "refundedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ops_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_admins_email_key" ON "platform_admins"("email");

-- CreateIndex
CREATE INDEX "platform_admins_email_idx" ON "platform_admins"("email");

-- CreateIndex
CREATE UNIQUE INDEX "platform_admin_refresh_tokens_tokenHash_key" ON "platform_admin_refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "platform_admin_refresh_tokens_adminId_idx" ON "platform_admin_refresh_tokens"("adminId");

-- CreateIndex
CREATE INDEX "platform_admin_refresh_tokens_expiresAt_idx" ON "platform_admin_refresh_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "organization_notes_organizationId_idx" ON "organization_notes"("organizationId");

-- CreateIndex
CREATE INDEX "organization_suspensions_organizationId_idx" ON "organization_suspensions"("organizationId");

-- CreateIndex
CREATE INDEX "platform_audit_logs_actorId_idx" ON "platform_audit_logs"("actorId");

-- CreateIndex
CREATE INDEX "platform_audit_logs_targetType_targetId_idx" ON "platform_audit_logs"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "platform_audit_logs_action_createdAt_idx" ON "platform_audit_logs"("action", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_slug_key" ON "subscription_plans"("slug");

-- CreateIndex
CREATE INDEX "subscription_plans_isActive_idx" ON "subscription_plans"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "organization_subscriptions_organizationId_key" ON "organization_subscriptions"("organizationId");

-- CreateIndex
CREATE INDEX "organization_subscriptions_planId_idx" ON "organization_subscriptions"("planId");

-- CreateIndex
CREATE INDEX "organization_subscriptions_status_currentPeriodEnd_idx" ON "organization_subscriptions"("status", "currentPeriodEnd");

-- CreateIndex
CREATE INDEX "subscription_overrides_subscriptionId_removedAt_idx" ON "subscription_overrides"("subscriptionId", "removedAt");

-- CreateIndex
CREATE INDEX "subscription_overrides_expiresAt_idx" ON "subscription_overrides"("expiresAt");

-- CreateIndex
CREATE INDEX "subscription_change_logs_subscriptionId_idx" ON "subscription_change_logs"("subscriptionId");

-- CreateIndex
CREATE INDEX "ops_message_logs_organizationId_idx" ON "ops_message_logs"("organizationId");

-- CreateIndex
CREATE INDEX "ops_message_logs_status_createdAt_idx" ON "ops_message_logs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ops_message_logs_template_idx" ON "ops_message_logs"("template");

-- CreateIndex
CREATE UNIQUE INDEX "ops_payments_razorpayOrderId_key" ON "ops_payments"("razorpayOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "ops_payments_razorpayPaymentId_key" ON "ops_payments"("razorpayPaymentId");

-- CreateIndex
CREATE INDEX "ops_payments_organizationId_idx" ON "ops_payments"("organizationId");

-- CreateIndex
CREATE INDEX "ops_payments_status_createdAt_idx" ON "ops_payments"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "platform_admin_refresh_tokens" ADD CONSTRAINT "platform_admin_refresh_tokens_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "platform_admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_notes" ADD CONSTRAINT "organization_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "platform_admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "platform_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_subscriptions" ADD CONSTRAINT "organization_subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_overrides" ADD CONSTRAINT "subscription_overrides_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "organization_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_change_logs" ADD CONSTRAINT "subscription_change_logs_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "organization_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
