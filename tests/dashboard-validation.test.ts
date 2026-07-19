import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { parseAddContactMemoryInput, parseUpdateContactRoleplayStateInput } from '../src/dashboard/dashboard.validation';

describe('dashboard validation', () => {
  it('accepts bounded memory input', () => {
    const input = parseAddContactMemoryInput({
      kind: 'preference',
      content: 'Suka kopi tanpa gula',
      importance: 80,
    });

    assert.equal(input.kind, 'preference');
    assert.equal(input.content, 'Suka kopi tanpa gula');
  });

  it('rejects out-of-range roleplay state values', () => {
    assert.throws(
      () => parseUpdateContactRoleplayStateInput({ affection: 101 }),
      BadRequestException,
    );
  });
});
