import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CommandRegistryService } from '../src/bot/command-registry.service';
import { CommandHandler } from '../src/bot/domain/command-handler';
import { CommandContext } from '../src/bot/domain/command-context';

describe('CommandRegistryService', () => {
  it('tokenizes slash commands and passes raw args to the handler', async () => {
    const seen: Partial<CommandContext> = {};
    const handler: CommandHandler = {
      command: 'ping',
      description: 'test command',
      handle: async (context) => {
        Object.assign(seen, context);
        return { text: 'pong' };
      },
    };

    const registry = new CommandRegistryService([handler]);
    const reply = await registry.execute({
      message: {
        id: 'msg-1',
        chatId: '6281@c.us',
        chatIdAliases: ['6281@c.us'],
        body: '/PING hello  world',
        timestamp: new Date(),
        isGroup: false,
      },
      settings: {} as CommandContext['settings'],
      args: [],
      rawArgs: '',
    });

    assert.equal(reply?.text, 'pong');
    assert.deepEqual(seen.args, ['hello', 'world']);
    assert.equal(seen.rawArgs, 'hello world');
  });

  it('returns a helpful reply for unknown commands', async () => {
    const registry = new CommandRegistryService([]);
    const reply = await registry.execute({
      message: {
        id: 'msg-1',
        chatId: '6281@c.us',
        chatIdAliases: ['6281@c.us'],
        body: '!missing',
        timestamp: new Date(),
        isGroup: false,
      },
      settings: {} as CommandContext['settings'],
      args: [],
      rawArgs: '',
    });

    assert.match(reply?.text ?? '', /Command \/missing belum tersedia/u);
  });
});
