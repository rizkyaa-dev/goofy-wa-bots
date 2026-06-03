-- CreateTable
CREATE TABLE "ContactSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatId" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'command_only',
    "persona" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ConversationMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "messageId" TEXT,
    "chatId" TEXT NOT NULL,
    "authorId" TEXT,
    "direction" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "responseText" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Note_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "ContactSetting" ("chatId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ContactSetting_chatId_key" ON "ContactSetting"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationMessage_messageId_key" ON "ConversationMessage"("messageId");

-- CreateIndex
CREATE INDEX "Note_chatId_createdAt_idx" ON "Note"("chatId", "createdAt");
