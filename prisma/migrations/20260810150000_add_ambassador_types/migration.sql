-- AlterEnum
ALTER TYPE "AuditTargetType" ADD VALUE 'AMBASSADOR_TYPE';

-- CreateTable
CREATE TABLE "ambassador_types" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "proofFieldLabel" TEXT NOT NULL DEFAULT 'Identity / Enrollment Proof',
    "applicationFields" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ambassador_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_ambassador_type_access" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "ambassadorTypeId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "updatedByName" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_ambassador_type_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ambassador_types_key_key" ON "ambassador_types"("key");

-- CreateIndex
CREATE INDEX "ambassador_types_key_idx" ON "ambassador_types"("key");

-- CreateIndex
CREATE UNIQUE INDEX "organization_ambassador_type_access_organizationId_ambass_key" ON "organization_ambassador_type_access"("organizationId", "ambassadorTypeId");

-- AddForeignKey
ALTER TABLE "ambassador_types" ADD CONSTRAINT "ambassador_types_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "platform_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_ambassador_type_access" ADD CONSTRAINT "organization_ambassador_type_access_ambassadorTypeId_fkey" FOREIGN KEY ("ambassadorTypeId") REFERENCES "ambassador_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_ambassador_type_access" ADD CONSTRAINT "organization_ambassador_type_access_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "platform_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
