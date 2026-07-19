import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ContactPolicyService } from '../src/contacts/contact-policy.service';
import { AppEnv } from '../src/config/env.validation';

const config = (values: Partial<AppEnv>) => ({
  get: <K extends keyof AppEnv>(key: K) => values[key] ?? '',
});

describe('ContactPolicyService', () => {
  it('allows every chat when no owner or allowlist is configured', () => {
    const policy = new ContactPolicyService(config({}) as never);

    assert.equal(
      policy.canRespondTo({
        id: 'msg-1',
        chatId: 'unknown@c.us',
        chatIdAliases: ['unknown@c.us'],
        body: 'hai',
        timestamp: new Date(),
        isGroup: false,
      }),
      true,
    );
  });

  it('matches any normalized chat alias against the allowlist', () => {
    const policy = new ContactPolicyService(
      config({
        BOT_OWNER_NUMBER: '',
        BOT_ALLOWED_NUMBERS: '6281@c.us, 120@g.us',
      }) as never,
    );

    assert.equal(
      policy.canRespondTo({
        id: 'msg-1',
        chatId: 'chat-alias',
        chatIdAliases: ['chat-alias', '120@g.us'],
        body: 'hai',
        timestamp: new Date(),
        isGroup: true,
      }),
      true,
    );
  });
});
