-- CreateTable
CREATE TABLE "SandboxTokenUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatId" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SandboxTokenUsage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "ContactSetting" ("chatId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SandboxTokenUsage_chatId_key" ON "SandboxTokenUsage"("chatId");
