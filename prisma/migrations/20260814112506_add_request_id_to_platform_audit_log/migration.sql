-- AlterTable
ALTER TABLE "platform_audit_logs" ADD COLUMN     "requestId" TEXT;

-- CreateIndex
CREATE INDEX "platform_audit_logs_requestId_idx" ON "platform_audit_logs"("requestId");
