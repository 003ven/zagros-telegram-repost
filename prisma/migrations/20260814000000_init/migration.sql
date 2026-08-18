-- CreateTable
CREATE TABLE "Connection" (
    "id" TEXT NOT NULL,
    "sourceChannel" TEXT NOT NULL,
    "targetChannel" TEXT NOT NULL,
    "botToken" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "lastMessageId" INTEGER,
    "lastReceivedAt" TIMESTAMP(3),
    "transferredCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastError" TEXT,
    "consecutiveErrors" INTEGER NOT NULL DEFAULT 0,
    "pollIntervalMs" INTEGER NOT NULL DEFAULT 15000,
    "config" JSONB NOT NULL,

    CONSTRAINT "Connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogEntry" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "details" TEXT,

    CONSTRAINT "LogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Connection_status_idx" ON "Connection"("status");

-- CreateIndex
CREATE INDEX "LogEntry_connectionId_timestamp_idx" ON "LogEntry"("connectionId", "timestamp");
