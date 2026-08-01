import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GeminiProvider } from '../src/llm/providers/gemini.provider';
import { OpenAiProvider } from '../src/llm/providers/openai.provider';
import { LlmProviderError } from '../src/llm/errors/llm-provider.error';
import { LlmService } from '../src/llm/llm.service';
import { AppEnv } from '../src/config/env.validation';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const config = (values: Partial<AppEnv>) => ({
  get: <K extends keyof AppEnv>(key: K) => values[key],
});

describe('LLM provider contracts', () => {
  it('aborts provider requests after the configured timeout', async () => {
    let aborted = false;
    const provider = {
      name: 'fake',
      getDefaultModel: () => 'fake-model',
      getDefaultOptions: () => ({}),
      generateReply: async (input: { signal?: AbortSignal }) => new Promise<never>((_, reject) => {
        input.signal?.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('aborted'));
        }, { once: true });
      }),
    };
    const service = new LlmService(
      config({ LLM_PROVIDER: 'fake', LLM_TIMEOUT_MS: 5 } as Partial<AppEnv>) as never,
      provider as never,
      { name: 'unused-openai' } as never,
      { name: 'unused-deepseek' } as never,
    );

    await assert.rejects(
      () => service.generateReply({ providerName: 'fake', messages: [{ role: 'user', content: 'hai' }] }),
      (error: unknown) => error instanceof LlmProviderError && /timed out/u.test(error.message),
    );
    assert.equal(aborted, true);
  });

  it('maps OpenAI-compatible request and usage into the common provider result', async () => {
    let capturedBody: unknown;
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(String(init.body));
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: ' halo ' } }],
          usage: {
            prompt_tokens: 11,
            completion_tokens: 7,
            total_tokens: 18,
          },
        }),
      } as Response;
    }) as typeof fetch;

    const provider = new OpenAiProvider(
      config({
        OPENAI_BASE_URL: 'https://api.example.test/v1',
        OPENAI_API_KEY: 'token',
        OPENAI_MODEL: 'model-a',
        OPENAI_MAX_TOKENS: 120,
        LLM_MAX_TOKENS: 120,
        OPENAI_REASONING_EFFORT: 'high',
      }) as never,
    );

    const result = await provider.generateReply({
      model: 'model-a',
      messages: [{ role: 'user', content: 'hai' }],
      temperature: 0.2,
      maxTokens: 32,
    });

    assert.deepEqual(capturedBody, {
      model: 'model-a',
      messages: [{ role: 'user', content: 'hai' }],
      temperature: 0.2,
      max_tokens: 32,
    });
    assert.equal(result.text, 'halo');
    assert.deepEqual(result.usage, {
      inputTokens: 11,
      outputTokens: 7,
      totalTokens: 18,
    });
  });

  it('maps Gemini system messages into system_instruction and non-system contents', async () => {
    let capturedBody: any;
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(String(init.body));
      return {
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'baik' }] } }],
          usageMetadata: {
            promptTokenCount: 3,
            candidatesTokenCount: 2,
            totalTokenCount: 5,
          },
        }),
      } as Response;
    }) as typeof fetch;

    const provider = new GeminiProvider(
      config({
        GEMINI_API_KEY: 'key',
        GEMINI_BASE_URL: 'https://gemini.example.test',
        GEMINI_MODEL: 'gemini-test',
        GEMINI_MAX_TOKENS: 64,
        LLM_MAX_TOKENS: 64,
      }) as never,
    );

    const result = await provider.generateReply({
      model: 'gemini-test',
      messages: [
        { role: 'system', content: 'system rule' },
        { role: 'assistant', content: 'old reply' },
        { role: 'user', content: 'new turn' },
      ],
    });

    assert.equal(capturedBody.system_instruction.parts[0].text, 'system rule');
    assert.deepEqual(capturedBody.contents, [
      { role: 'model', parts: [{ text: 'old reply' }] },
      { role: 'user', parts: [{ text: 'new turn' }] },
    ]);
    assert.equal(result.text, 'baik');
    assert.equal(result.usage?.totalTokens, 5);
  });

  it('normalizes provider HTTP failures into LlmProviderError', async () => {
    globalThis.fetch = (async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'bad key' } }),
    }) as Response) as typeof fetch;

    const provider = new OpenAiProvider(
      config({
        OPENAI_BASE_URL: 'https://api.example.test/v1',
        OPENAI_API_KEY: 'bad',
        OPENAI_MODEL: 'model-a',
        LLM_MAX_TOKENS: 120,
        OPENAI_REASONING_EFFORT: 'high',
      }) as never,
    );

    await assert.rejects(
      () => provider.generateReply({ model: 'model-a', messages: [{ role: 'user', content: 'hai' }] }),
      LlmProviderError,
    );
  });
});
