import { Injectable } from '@nestjs/common';
import { IncomingMessage } from '../../messages/domain/incoming-message';

@Injectable()
export class RoleplayMemoryTriggerService {
  shouldExtract(message: IncomingMessage): boolean {
    const text = message.body.toLowerCase().trim();

    if (text.length < 8 || text.length > 500) {
      return false;
    }

    return this.patterns.some((pattern) => text.includes(pattern)) || this.regexPatterns.some((pattern) => pattern.test(text));
  }

  private readonly patterns = [
    'namaku',
    'nama aku',
    'panggil aku',
    'aku suka',
    'aku nggak suka',
    'aku gak suka',
    'aku tidak suka',
    'ingat',
    'jangan lupa',
    'besok',
    'nanti',
    'biasanya',
    'aku lagi',
    'aku punya',
    'aku kerja',
    'aku kuliah',
    'project',
    'proyek',
    'jangan panggil',
    'jangan bahas',
    'aku mau',
    'aku pengen',
  ];

  private readonly regexPatterns = [
    /\bnama\s+ku\b/u,
    /\bnama\s+saya\b/u,
    /\bpanggil\s+(aja|saja|saya|aku)\b/u,
    /\bpanggilnya\s+/u,
  ];
}
