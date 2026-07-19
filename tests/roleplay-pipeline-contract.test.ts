import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RoleplayChatService } from '../src/roleplay/roleplay-chat.service';

describe('roleplay pipeline contract', () => {
  it('keeps RoleplayChatService as a stable facade over the reply use-case', async () => {
    const calls: unknown[] = [];
    const service = new RoleplayChatService({
      execute: async (input: unknown) => {
        calls.push(input);
        return { text: 'ok' };
      },
    } as never);
    const message = {
      id: 'm1',
      chatId: '6281@c.us',
      chatIdAliases: ['6281@c.us'],
      body: 'hai',
      timestamp: new Date(),
      isGroup: false,
    };
    const settings = { chatId: '6281@c.us' };

    const reply = await service.generateReply(message, settings as never);

    assert.equal(reply.text, 'ok');
    assert.deepEqual(calls, [{ message, settings }]);
  });
});
