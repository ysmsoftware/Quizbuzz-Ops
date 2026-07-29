-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('QUOTED', 'PAID', 'PROVISIONED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "pricing_configs" (
    "id" TEXT NOT NULL DEFAULT 'pricing_default',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "baseBookingFee" DECIMAL(10,2) NOT NULL,
    "perParticipantCost" DECIMAL(10,2) NOT NULL,
    "perQuestionCost" DECIMAL(10,2) NOT NULL,
    "perInstanceHourCost" DECIMAL(10,2) NOT NULL,
    "participantsPerInstance" INTEGER NOT NULL,
    "elastiCachePerDayCost" DECIMAL(10,2) NOT NULL,
    "addOnProctoringEnabled" BOOLEAN NOT NULL DEFAULT true,
    "addOnProctoringFlatCost" DECIMAL(10,2) NOT NULL,
    "addOnCertificatesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "addOnCertificatesPerParticipantCost" DECIMAL(10,2) NOT NULL,
    "addOnPrioritySupportEnabled" BOOLEAN NOT NULL DEFAULT true,
    "addOnPrioritySupportFlatCost" DECIMAL(10,2) NOT NULL,
    "marginMultiplier" DECIMAL(5,3) NOT NULL,
    "updatedById" TEXT,
    "updatedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contest_bookings" (
    "id" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'QUOTED',
    "organizationId" TEXT,
    "organizationName" TEXT,
    "organizationEmail" TEXT,
    "contestName" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "questionCount" INTEGER NOT NULL,
    "participantCount" INTEGER NOT NULL,
    "addOnProctoring" BOOLEAN NOT NULL,
    "addOnCertificates" BOOLEAN NOT NULL,
    "addOnPrioritySupport" BOOLEAN NOT NULL,
    "pricingBreakdown" JSONB NOT NULL,
    "desiredStartTime" TIMESTAMP(3),
    "quotedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "provisionedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "paymentMethod" TEXT,
    "paymentReference" TEXT,
    "opsPaymentId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contest_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contest_bookings_opsPaymentId_key" ON "contest_bookings"("opsPaymentId");

-- CreateIndex
CREATE INDEX "contest_bookings_status_idx" ON "contest_bookings"("status");

-- CreateIndex
CREATE INDEX "contest_bookings_organizationId_idx" ON "contest_bookings"("organizationId");

-- CreateIndex
CREATE INDEX "contest_bookings_quotedAt_idx" ON "contest_bookings"("quotedAt");

-- AddForeignKey
ALTER TABLE "pricing_configs" ADD CONSTRAINT "pricing_configs_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "platform_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_bookings" ADD CONSTRAINT "contest_bookings_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "platform_admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_bookings" ADD CONSTRAINT "contest_bookings_opsPaymentId_fkey" FOREIGN KEY ("opsPaymentId") REFERENCES "ops_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
