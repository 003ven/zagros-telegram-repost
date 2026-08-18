-- CreateTable
CREATE TABLE "SentContentHash" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SentContentHash_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SentContentHash_connectionId_contentHash_idx" ON "SentContentHash"("connectionId", "contentHash");

-- CreateIndex
CREATE INDEX "SentContentHash_sentAt_idx" ON "SentContentHash"("sentAt");
