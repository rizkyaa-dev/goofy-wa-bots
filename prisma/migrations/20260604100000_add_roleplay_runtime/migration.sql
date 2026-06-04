-- CreateTable
CREATE TABLE "RoleplayState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatId" TEXT NOT NULL,
    "mood" TEXT NOT NULL DEFAULT 'neutral',
    "affection" INTEGER NOT NULL DEFAULT 50,
    "trust" INTEGER NOT NULL DEFAULT 50,
    "energy" INTEGER NOT NULL DEFAULT 70,
    "tension" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT,
    "lastInteractionAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RoleplayState_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "ContactSetting" ("chatId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RoleplayMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "importance" INTEGER NOT NULL DEFAULT 50,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RoleplayMemory_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "ContactSetting" ("chatId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "RoleplayState_chatId_key" ON "RoleplayState"("chatId");

-- CreateIndex
CREATE INDEX "RoleplayMemory_chatId_importance_updatedAt_idx" ON "RoleplayMemory"("chatId", "importance", "updatedAt");
