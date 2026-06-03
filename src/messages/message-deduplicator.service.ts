import { Injectable } from '@nestjs/common';

@Injectable()
export class MessageDeduplicatorService {
  private readonly seen = new Map<string, number>();
  private readonly ttlMs = 10 * 60 * 1000;

  isDuplicate(messageId: string): boolean {
    const now = Date.now();
    this.prune(now);

    if (this.seen.has(messageId)) {
      return true;
    }

    this.seen.set(messageId, now + this.ttlMs);
    return false;
  }

  private prune(now: number): void {
    for (const [messageId, expiresAt] of this.seen.entries()) {
      if (expiresAt <= now) {
        this.seen.delete(messageId);
      }
    }
  }
}
