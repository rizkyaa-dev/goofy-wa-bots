import { ContactSetting } from '@prisma/client';
import { IncomingMessage } from '../../messages/domain/incoming-message';

export type CommandContext = {
  message: IncomingMessage;
  settings: ContactSetting;
  args: string[];
  rawArgs: string;
};
