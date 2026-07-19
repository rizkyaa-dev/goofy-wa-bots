import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaService, prismaStorage } from '../src/infra/prisma/prisma.service';

describe('Prisma sandbox isolation', () => {
  it('routes PrismaService property access through AsyncLocalStorage when present', () => {
    const prisma = new PrismaService() as unknown as { marker: () => string };
    const sandboxClient = {
      marker: () => 'sandbox',
    };

    const value = prismaStorage.run(sandboxClient as never, () => prisma.marker());

    assert.equal(value, 'sandbox');
  });
});
