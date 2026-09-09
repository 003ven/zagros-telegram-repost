-- CreateTable
CREATE TABLE "OutboundPost" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "targetChannel" TEXT NOT NULL,
    "messageId" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reactions" JSONB,
    "reactionsUpdatedAt" TIMESTAMP(3),

    CONSTRAINT "OutboundPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramUpdateOffset" (
    "botTokenHash" TEXT NOT NULL,
    "lastUpdateId" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramUpdateOffset_pkey" PRIMARY KEY ("botTokenHash")
);

-- CreateIndex
CREATE INDEX "OutboundPost_connectionId_idx" ON "OutboundPost"("connectionId");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundPost_targetChannel_messageId_key" ON "OutboundPost"("targetChannel", "messageId");
