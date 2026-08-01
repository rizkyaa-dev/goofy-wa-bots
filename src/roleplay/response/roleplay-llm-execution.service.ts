import { Injectable } from '@nestjs/common';
import { ContactSetting } from '@prisma/client';
import { LlmMessage, GenerateReplyResult } from '../../llm/domain/llm.types';
import { LlmService } from '../../llm/llm.service';

@Injectable()
export class RoleplayLlmExecutionService {
  constructor(private readonly llm: LlmService) {}

  async generate(settings: ContactSetting, messages: LlmMessage[]): Promise<GenerateReplyResult> {
    return this.llm.generateReply({
      providerName: settings.llmProvider,
      model: settings.llmModel,
      messages,
    });
  }
}
