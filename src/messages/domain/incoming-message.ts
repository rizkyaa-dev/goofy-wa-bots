export type IncomingMessage = {
  id: string;
  chatId: string;
  chatIdAliases: string[];
  authorId?: string;
  body: string;
  timestamp: Date;
  isGroup: boolean;
};
