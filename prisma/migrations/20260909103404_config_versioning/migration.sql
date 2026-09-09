-- CreateTable
CREATE TABLE "ConnectionConfigVersion" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConnectionConfigVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConnectionConfigVersion_connectionId_createdAt_idx" ON "ConnectionConfigVersion"("connectionId", "createdAt");
