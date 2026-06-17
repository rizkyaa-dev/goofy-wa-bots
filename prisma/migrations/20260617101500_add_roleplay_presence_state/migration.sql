CREATE TABLE "RoleplayPresenceState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatId" TEXT NOT NULL,
    "activityType" TEXT NOT NULL,
    "statusText" TEXT NOT NULL,
    "locationLabel" TEXT NOT NULL,
    "socialContext" TEXT NOT NULL,
    "interruptibility" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 10,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "lastReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RoleplayPresenceState_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "ContactSetting" ("chatId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "RoleplayPresenceState_chatId_key" ON "RoleplayPresenceState"("chatId");
