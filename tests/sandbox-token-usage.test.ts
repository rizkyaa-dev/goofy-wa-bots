import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SandboxUseCase } from '../src/sandbox/sandbox.use-case';

describe('sandbox token usage', () => {
  it('persists and returns the cumulative usage for a sandbox chat', async () => {
    const accumulated: Array<{ chatId: string; usage: unknown }> = [];
    const repository = {
      ensureContact: async () => ({ chatId: 'sandbox-user-1' }),
      accumulateTokenUsage: async (chatId: string, usage: unknown) => {
        accumulated.push({ chatId, usage });
        return { inputTokens: 4_755, outputTokens: 330, totalTokens: 5_085 };
      },
    };
    const service = new SandboxUseCase(
      {} as never,
      repository as never,
      { generateReply: async () => ({ text: 'halo' }) } as never,
      {} as never,
      { recordInbound: async () => undefined, recordOutbound: async () => undefined } as never,
      {
        runWithUsage: async (operation: () => Promise<unknown>) => ({
          result: await operation(),
          usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
        }),
      } as never,
    );

    const result = await service.chat({ chatId: 'sandbox-user-1', text: 'hai' });

    assert.deepEqual(accumulated, [
      {
        chatId: 'sandbox-user-1',
        usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
      },
    ]);
    assert.deepEqual(result.tokenUsage, { inputTokens: 4_755, outputTokens: 330, totalTokens: 5_085 });
  });
});
