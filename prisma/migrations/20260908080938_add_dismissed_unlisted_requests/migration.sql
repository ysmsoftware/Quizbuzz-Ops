-- CreateTable
CREATE TABLE "dismissed_unlisted_requests" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "collegeKey" TEXT NOT NULL,
    "departmentKey" TEXT NOT NULL DEFAULT '',
    "dismissedByName" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dismissed_unlisted_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dismissed_unlisted_requests_kind_collegeKey_departmentKey_key" ON "dismissed_unlisted_requests"("kind", "collegeKey", "departmentKey");
