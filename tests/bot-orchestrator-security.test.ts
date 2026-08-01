import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BotOrchestratorService } from '../src/bot/bot-orchestrator.service';
import { TemporaryGreetingReplyService } from '../src/bot/temporary-greeting-reply.service';

describe('BotOrchestratorService security boundaries', () => {
  it('does not send the temporary greeting to a non-allowlisted chat', async () => {
    const orchestrator = new BotOrchestratorService(
      { canRespondTo: () => false } as never,
      {} as never,
      { recordInbound: async () => undefined } as never,
      { isDuplicate: () => false } as never,
      {} as never,
      new TemporaryGreetingReplyService({ get: () => true } as never),
      {} as never,
    );

    const reply = await orchestrator.handle({
      id: 'm1',
      chatId: 'unknown@c.us',
      chatIdAliases: ['unknown@c.us'],
      body: 'hai',
      timestamp: new Date(),
      isGroup: false,
    });

    assert.equal(reply, null);
  });
});
