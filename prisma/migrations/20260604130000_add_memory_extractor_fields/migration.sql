-- AlterTable
ALTER TABLE "RoleplayMemory" ADD COLUMN "confidence" REAL NOT NULL DEFAULT 1.0;
ALTER TABLE "RoleplayMemory" ADD COLUMN "sourceText" TEXT;
ALTER TABLE "RoleplayMemory" ADD COLUMN "expiresAt" DATETIME;

-- CreateIndex
CREATE INDEX "RoleplayMemory_chatId_kind_updatedAt_idx" ON "RoleplayMemory"("chatId", "kind", "updatedAt");
