import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { prismaStorage } from '../src/infra/prisma/prisma.service';
import { SandboxUseCase } from '../src/sandbox/sandbox.use-case';

describe('sandbox use-case contract', () => {
  it('wraps operations in the sandbox Prisma context', async () => {
    const sandboxClient = { marker: 'sandbox' };
    const useCase = new SandboxUseCase(
      sandboxClient as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await useCase.runInSandbox(async () => prismaStorage.getStore());

    assert.equal(result, sandboxClient);
  });
});
