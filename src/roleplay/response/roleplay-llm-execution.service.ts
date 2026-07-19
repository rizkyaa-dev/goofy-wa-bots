import { Injectable } from '@nestjs/common';
import { ContactSetting } from '@prisma/client';
import { LlmMessage, GenerateReplyResult } from '../../llm/domain/llm.types';
import { LlmService } from '../../llm/llm.service';

@Injectable()
export class RoleplayLlmExecutionService {
  private readonly timeoutMs = 45_000;

  constructor(private readonly llm: LlmService) {}

  async generate(settings: ContactSetting, messages: LlmMessage[]): Promise<GenerateReplyResult> {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error(`LLM generation timed out after ${this.timeoutMs}ms`)), this.timeoutMs);
    });

    try {
      return await Promise.race([
        this.llm.generateReply({
          providerName: settings.llmProvider,
          model: settings.llmModel,
          messages,
        }),
        timeoutPromise,
      ]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }
}
