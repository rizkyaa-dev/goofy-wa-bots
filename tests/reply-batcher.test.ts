import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WhatsappReplyBatcherService } from '../src/wa/whatsapp-reply-batcher.service';
import { AppEnv } from '../src/config/env.validation';

const configValues: Partial<AppEnv> = {
  BOT_REPLY_BATCHING_ENABLED: true,
  BOT_REPLY_MIN_QUIET_MS: 1_800,
  BOT_REPLY_FRAGMENT_QUIET_MS: 5_000,
  BOT_REPLY_LONG_TEXT_QUIET_MS: 7_500,
  BOT_REPLY_MAX_WAIT_MS: 15_000,
  BOT_REPLY_BATCH_MAX_MESSAGES: 8,
};

describe('WhatsappReplyBatcherService', () => {
  it('uses longer quiet windows for incomplete fragments and long text', () => {
    const batcher = new WhatsappReplyBatcherService(
      {} as never,
      { get: <K extends keyof AppEnv>(key: K) => configValues[key] } as never,
      {} as never,
    );

    const calculateQuietMs = (batcher as unknown as { calculateQuietMs: (text: string, batchSize: number) => number })
      .calculateQuietMs.bind(batcher);

    assert.equal(calculateQuietMs('jadi', 1), 5_000);
    assert.equal(calculateQuietMs('a'.repeat(140), 1), 7_500);
    assert.equal(calculateQuietMs('pesan lengkap.', 1), 1_800);
  });

  it('invalidates an in-flight flush after cancellation', () => {
    const batcher = new WhatsappReplyBatcherService(
      {} as never,
      { get: <K extends keyof AppEnv>(key: K) => configValues[key] } as never,
      {} as never,
    );
    const internal = batcher as unknown as {
      getOrCreateState: (chatId: string) => { version: number };
      cancel: (chatId: string) => void;
      isCurrent: (chatId: string, version: number) => boolean;
    };

    const state = internal.getOrCreateState('chat-1');
    const version = state.version;
    internal.cancel('chat-1');

    assert.equal(internal.isCurrent('chat-1', version), false);
  });
});
