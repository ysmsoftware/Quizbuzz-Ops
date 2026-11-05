-- CreateEnum
CREATE TYPE "PlanKind" AS ENUM ('FREE', 'STANDARD', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PlanAudience" AS ENUM ('ORGANIZER', 'EDUCATION', 'BUSINESS');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OpsMessageTemplate" ADD VALUE 'SUBSCRIPTION_PAST_DUE';
ALTER TYPE "OpsMessageTemplate" ADD VALUE 'SUBSCRIPTION_RESTRICTED';

-- AlterEnum
ALTER TYPE "SubscriptionStatus" ADD VALUE 'RESTRICTED';

-- AlterTable
ALTER TABLE "organization_subscriptions" ADD COLUMN     "graceDays" INTEGER NOT NULL DEFAULT 7;

-- AlterTable
ALTER TABLE "subscription_plans" ADD COLUMN     "aiCreditsPerMonth" INTEGER,
ADD COLUMN     "allowsHalfYearly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "audience" "PlanAudience",
ADD COLUMN     "commissionPercent" DECIMAL(5,2),
ADD COLUMN     "featureAmbassadorCampaigns" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "featureGradebook" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "featureLearnerGroups" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "featureManualEmails" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "halfYearlyPrice" DECIMAL(10,2),
ADD COLUMN     "isSellable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kind" "PlanKind" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "maxCandidatesPerMonth" INTEGER,
ADD COLUMN     "maxLearners" INTEGER,
ADD COLUMN     "organizationId" TEXT;
