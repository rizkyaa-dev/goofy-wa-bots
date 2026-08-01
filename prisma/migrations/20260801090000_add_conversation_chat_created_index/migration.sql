-- CreateIndex
CREATE INDEX "ConversationMessage_chatId_createdAt_idx" ON "ConversationMessage"("chatId", "createdAt");
